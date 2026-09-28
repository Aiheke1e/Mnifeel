import { randomUUID } from "node:crypto";
import type { DatabaseTransaction } from "@/utils/database";

type TaskCredits = {
  id: string;
  userId: string;
  frozenCredits: number;
};

type AccountRow = {
  availableCredits: number;
  frozenCredits: number;
};

function credits(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("积分数值无效");
  return value;
}

async function writeTransaction(
  transaction: DatabaseTransaction,
  task: TaskCredits,
  type: "taskFreeze" | "taskSettle" | "taskRefund",
  availableDelta: number,
  frozenDelta: number,
  account: AccountRow,
  metadata: Record<string, string | number>,
) {
  await transaction`
    insert into "creditTransactions" (
      "id", "userId", "taskId", "type", "availableDelta", "frozenDelta",
      "availableAfter", "frozenAfter", "metadata"
    ) values (
      ${randomUUID()}, ${task.userId}, ${task.id}, ${type}, ${availableDelta}, ${frozenDelta},
      ${account.availableCredits}, ${account.frozenCredits}, ${transaction.json(metadata)}
    )
  `;
}

export async function freezeTaskCredits(transaction: DatabaseTransaction, task: TaskCredits) {
  const amount = credits(task.frozenCredits);
  if (!amount) return;
  const accounts = await transaction<AccountRow[]>`
    update "creditAccounts" set
      "availableCredits" = "availableCredits" - ${amount},
      "frozenCredits" = "frozenCredits" + ${amount},
      "updatedAt" = now()
    where "userId" = ${task.userId} and "availableCredits" >= ${amount}
    returning "availableCredits", "frozenCredits"
  `;
  const account = accounts[0];
  if (!account) throw Object.assign(new Error("积分余额不足"), { status: 402 });
  await writeTransaction(transaction, task, "taskFreeze", -amount, amount, account, { frozenCredits: amount });
}

export async function settleTaskCredits(transaction: DatabaseTransaction, task: TaskCredits, actualCredits: number) {
  const frozen = credits(task.frozenCredits);
  const actual = credits(actualCredits);
  if (actual > frozen) throw new Error("实际积分超过任务冻结积分");
  if (!frozen) return { actualCredits: 0, refundedCredits: 0 };
  const released = frozen - actual;
  const accounts = await transaction<AccountRow[]>`
    update "creditAccounts" set
      "availableCredits" = "availableCredits" + ${released},
      "frozenCredits" = "frozenCredits" - ${frozen},
      "updatedAt" = now()
    where "userId" = ${task.userId} and "frozenCredits" >= ${frozen}
    returning "availableCredits", "frozenCredits"
  `;
  const account = accounts[0];
  if (!account) throw new Error("冻结积分账本不一致");
  await writeTransaction(transaction, task, "taskSettle", released, -frozen, account, {
    actualCredits: actual,
    releasedCredits: released,
  });
  return { actualCredits: actual, refundedCredits: released };
}

export async function refundTaskCredits(transaction: DatabaseTransaction, task: TaskCredits) {
  const frozen = credits(task.frozenCredits);
  if (!frozen) return 0;
  const accounts = await transaction<AccountRow[]>`
    update "creditAccounts" set
      "availableCredits" = "availableCredits" + ${frozen},
      "frozenCredits" = "frozenCredits" - ${frozen},
      "updatedAt" = now()
    where "userId" = ${task.userId} and "frozenCredits" >= ${frozen}
    returning "availableCredits", "frozenCredits"
  `;
  const account = accounts[0];
  if (!account) throw new Error("冻结积分账本不一致");
  await writeTransaction(transaction, task, "taskRefund", frozen, -frozen, account, { refundedCredits: frozen });
  return frozen;
}
