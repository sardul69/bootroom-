import { redirect } from "next/navigation";
import { authorizeAdmin } from "@/lib/admin-auth";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const auth = await authorizeAdmin("games.create");

  if (!auth.ok) {
    redirect("/admin/login");
  }

  return <AdminDashboard />;
}
