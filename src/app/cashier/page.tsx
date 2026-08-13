import { redirect } from "next/navigation";

// Sales reconciliation replaced this as the cashier portal's default landing
// page — kept as a redirect so any old bookmarks/links to bare /cashier
// still land somewhere useful instead of 404ing.
export default function CashierRootPage() {
  redirect("/cashier/sales");
}
