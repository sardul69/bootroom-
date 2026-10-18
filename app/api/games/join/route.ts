
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder } from '@/lib/payments/razorpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate the player using the server-side Supabase session.
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return jsonError('Please sign in to join this game.', 401);
    }

    // 2. Accept only a valid JSON request.
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid request body.', 400);
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('gameId' in body) ||
      typeof body.gameId !== 'string' ||
      body.gameId.trim().length === 0 ||
      body.gameId.length > 100
    ) {
      return jsonError('A valid gameId is required.', 400);
    }

    const gameId = body.gameId.trim();

    // 3. Never create an order without the configured public Key ID.
    const keyId = process.env.RAZORPAY_KEY_ID;

    if (!keyId) {
      console.error('Razorpay configuration error: missing Key ID.');
      return jsonError('Payments are temporarily unavailable.', 503);
    }

    const supabase = createAdminClient();

    // 4. Read the game and its fee from the database, never from the client.
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, player_fee, status')
      .eq('id', gameId)
      .maybeSingle();

    if (gameError) {
      console.error('Unable to read game:', gameError.message);
      return jsonError('Unable to load this game.', 500);
    }

    if (!game) {
      return jsonError('Game not found.', 404);
    }

    if (game.status !== 'OPEN') {
      return jsonError('This game is no longer open.', 409);
    }

    // 5. Validate the database fee before converting it to paise.
    const amount = Number(game.player_fee);
    const amountInPaise = Math.round(amount * 100);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(amountInPaise) ||
      amountInPaise <= 0
    ) {
      console.error('Invalid player fee for game:', game.id);
      return jsonError('This game has an invalid player fee.', 500);
    }

    // 6. Create or retrieve the player's game entry.
    // IMPORTANT: join_game must be concurrency-safe and must not itself
    // mark the player as paid or the payment as captured.
    const { data: playerResult, error: joinError } =
      await authClient.rpc('join_game', {
        p_game_id: game.id,
        p_user_id: user.id,
      });

    if (joinError || !playerResult) {
      console.error(
        'Unable to reserve game entry:',
        joinError?.message ?? 'No player entry returned'
      );
      return jsonError('Unable to reserve your place in this game.', 409);
    }

    const playerRow = Array.isArray(playerResult)
      ? playerResult[0]
      : playerResult;

    if (!playerRow?.id || typeof playerRow.id !== 'string') {
      console.error('join_game returned an invalid player entry.');
      return jsonError('Unable to prepare your game entry.', 500);
    }

    // 7. Inspect the existing payment before creating another order.
    const { data: existingPayment, error: paymentLookupError } =
      await supabase
        .from('game_payments')
        .select('id, user_id, provider, provider_order_id, amount, status')
        .eq('game_player_id', playerRow.id)
        .maybeSingle();

    if (paymentLookupError) {
      console.error(
        'Unable to inspect existing payment:',
        paymentLookupError.message
      );
      return jsonError('Unable to check your payment. Please retry later.', 500);
    }

    if (existingPayment) {
      if (
        existingPayment.user_id !== user.id ||
        existingPayment.provider !== 'razorpay'
      ) {
        return jsonError('Payment record does not match this player.', 409);
      }

      if (existingPayment.status === 'CAPTURED') {
        return NextResponse.json(
          {
            error: 'Payment is already recorded. Check your booking.',
            paymentCaptured: true,
          },
          { status: 409 }
        );
      }

      // Reuse only an order whose payment is still awaiting completion.
      if (
        existingPayment.provider_order_id &&
        existingPayment.status === 'CREATED'
      ) {
        const storedAmount = Number(existingPayment.amount);
        const storedPaise = Math.round(storedAmount * 100);

        if (
          !Number.isSafeInteger(storedPaise) ||
          storedPaise !== amountInPaise
        ) {
          console.error('Existing order amount differs from current game fee.');
          return jsonError(
            'Your existing payment needs to be checked by support.',
            409
          );
        }

        return NextResponse.json({
          keyId,
          order: {
            id: existingPayment.provider_order_id,
            amount: storedPaise,
            currency: 'INR',
          },
          gamePlayerId: playerRow.id,
        });
      }

      // Do not silently create another order for an unknown, failed,
      // authorized, or otherwise unreconciled payment state.
      return jsonError(
        'Your previous payment attempt needs verification before retrying.',
        409
      );
    }

    // 8. Create a Razorpay order on the server.
    let order;

    try {
      order = await createRazorpayOrder({
        amount: amountInPaise,
        receipt: playerRow.id,
        notes: {
          game_id: String(game.id),
          game_player_id: String(playerRow.id),
          user_id: user.id,
        },
      });
    } catch (error) {
      console.error(
        'Razorpay order creation failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return jsonError('Unable to start payment. Please try again later.', 502);
    }

    if (
      !order?.id ||
      order.amount !== amountInPaise ||
      order.currency !== 'INR'
    ) {
      console.error('Razorpay returned an unexpected order response.');
      return jsonError('Unable to prepare payment securely.', 502);
    }

    // 9. Persist the order before returning it to the browser.
    const { error: insertError } = await supabase
      .from('game_payments')
      .insert({
        game_player_id: playerRow.id,
        user_id: user.id,
        provider: 'razorpay',
        provider_order_id: order.id,
        amount,
        status: 'CREATED',
      });

    if (insertError) {
      // An order may exist at Razorpay even if this database write fails.
      // Do not return a usable checkout order without its local record.
      console.error(
        'Unable to persist Razorpay order:',
        insertError.message,
        'Order ID:',
        order.id
      );
      return jsonError(
        'Payment setup needs reconciliation. Do not retry repeatedly.',
        500
      );
    }

    // 10. This response means an order was created, NOT that payment succeeded.
    return NextResponse.json({
      keyId,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      gamePlayerId: playerRow.id,
    });
  } catch (error) {
    console.error(
      'Unexpected payment endpoint error:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return jsonError('An unexpected payment error occurred.', 500);
  }
}
