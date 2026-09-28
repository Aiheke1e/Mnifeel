import { Router } from "express";
import { getAuth } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

type AccountRow = { availableCredits: number; frozenCredits: number };
type TransactionRow = {
  id: string;
  taskId: string | null;
  type: "adminGrant" | "taskFreeze" | "taskSettle" | "taskRefund";
  availableDelta: number;
  frozenDelta: number;
  availableAfter: number;
  frozenAfter: number;
  createdAt: Date;
};

function creditValue(value: number) {
  const credits = Number(value);
  if (!Number.isSafeInteger(credits)) throw new Error("积分数据超出安全范围");
  return credits;
}

export default Router().get("/", async (_req, res) => {
  const userId = getAuth(res).user.id;
  const database = u.database.getDatabase();
  const [accounts, transactions] = await Promise.all([
    database<AccountRow[]>`
      select "availableCredits", "frozenCredits" from "creditAccounts"
      where "userId" = ${userId} limit 1
    `,
    database<TransactionRow[]>`
      select "id", "taskId", "type", "availableDelta", "frozenDelta",
        "availableAfter", "frozenAfter", "createdAt"
      from "creditTransactions" where "userId" = ${userId}
      order by "createdAt" desc, "id" desc limit 100
    `,
  ]);
  const account = accounts[0];
  if (!account) throw Object.assign(new Error("积分账户不存在"), { status: 404 });
  res.set("Cache-Control", "no-store").json(success({
    availableCredits: creditValue(account.availableCredits),
    frozenCredits: creditValue(account.frozenCredits),
    transactions: transactions.map(transaction => ({
      ...transaction,
      availableDelta: creditValue(transaction.availableDelta),
      frozenDelta: creditValue(transaction.frozenDelta),
      availableAfter: creditValue(transaction.availableAfter),
      frozenAfter: creditValue(transaction.frozenAfter),
      createdAt: transaction.createdAt.toISOString(),
    })),
  }));
});
