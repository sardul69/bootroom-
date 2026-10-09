import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder } from '@/lib/payments/razorpay';

export async function POST(req: Request) {
  const authClient = await createClient();

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Sign in required' },
      { status: 401 }
    );
  }

  const body = await req.json();
  const gameId = body.gameId;

  if (!gameId) {
    return NextResponse.json(
      { error: 'gameId required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(`
      id,
      player_fee,
      player_capacity,
      status
    `)
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    return NextResponse.json(
      { error: 'Game not found' },
      { status: 404 }
    );
  }

  if (game.status !== 'OPEN') {
    return NextResponse.json(
      { error: 'Game is no longer open' },
      { status: 409 }
    );
  }

  const { data: player, error: joinError } = await authClient.rpc(
    'join_game',
    {
      p_game_id: game.id,
      p_user_id: user.id,
    }
  );

  if (joinError || !player) {
    return NextResponse.json(
      { error: joinError?.message || 'Unable to join game' },
      { status: 409 }
    );
  }

  const playerRow = Array.isArray(player) ? player[0] : player;

  if (!playerRow?.id) {
    return NextResponse.json(
      { error: 'Unable to create player entry' },
      { status: 500 }
    );
  }

  const amount = Number(game.player_fee);

  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: 'Invalid player fee' },
      { status: 500 }
    );
  }

  const { data: existingPayment } = await supabase
    .from('game_payments')
    .select('*')
    .eq('game_player_id', playerRow.id)
    .maybeSingle();

  if (existingPayment?.provider_order_id) {
    return NextResponse.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      order: {
        id: existingPayment.provider_order_id,
        amount: Math.round(amount * 100),
        currency: 'INR',
      },
      gamePlayerId: playerRow.id,
    });
  }

  const order = await createRazorpayOrder({
    amount: Math.round(amount * 100),
    receipt: playerRow.id,
    notes: {
      game_id: game.id,
      game_player_id: playerRow.id,
      user_id: user.id,
    },
  });

  const { error: paymentError } = await supabase
    .from('game_payments')
    .insert({
      game_player_id: playerRow.id,
      user_id: user.id,
      provider: 'razorpay',
      provider_order_id: order.id,
      amount,
      status: 'CREATED',
    });

  if (paymentError) {
    return NextResponse.json(
      { error: 'Unable to create payment record' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    keyId: process.env.RAZORPAY_KEY_ID,
    order,
    gamePlayerId: playerRow.id,
  });
}