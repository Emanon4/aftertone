import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const dailyBudget = sqliteTable("daily_budget", {day:text("day").primaryKey(),count:integer("count").notNull().default(0)});
