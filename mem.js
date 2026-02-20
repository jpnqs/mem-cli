#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import clipboardy from "clipboardy";
import { JSONFilePreset } from "lowdb/node";
import path from "path";
import os from "os";
import fs from "fs-extra";
import Table from "cli-table3";
import inquirer from "inquirer";
import crypto from "crypto";
import { parse, isSameDay, subDays, startOfDay } from "date-fns";
import { translate, detectSystemLanguage } from "./src/translate.js";

const systemLocale = detectSystemLanguage();
const t = translate("./locales", detectSystemLanguage());

// --- CONFIGURATION ---
const defaultDir = path.join(os.homedir(), ".memory-cli-data");
const saveDir = process.env.MEMORY_CLI_SAVE_LOCATION || defaultDir;
const dbPath = path.join(saveDir, "db.json");
const vaultPath = path.join(saveDir, "vault.json");

fs.ensureDirSync(saveDir);

const db = await JSONFilePreset(dbPath, { entries: [] });
const vault = await JSONFilePreset(vaultPath, { secrets: {} });

const program = new Command();

program
  .name(t.get("program.name"))
  .description(t.get("program.description"))
  .version("1.0.0");

// --- HELPERS ---
const algorithm = "aes-256-cbc";

function encrypt(text, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${salt.toString("hex")}:${iv.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedData, password) {
  try {
    const [saltHex, ivHex, encryptedText] = encryptedData.split(":");
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const key = crypto.scryptSync(password, salt, 32);
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return null;
  }
}

const parseSearchDate = (dateStr) => {
  const today = startOfDay(new Date());
  const input = dateStr.toLowerCase();

  const todayTerms = ["today", "heute", "oggi", "hoy", "aujourd'hui"];
  const yesterdayTerms = ["yesterday", "gestern", "ieri", "ayer", "hier"];

  if (todayTerms.includes(input)) return today;
  if (yesterdayTerms.includes(input)) return subDays(today, 1);

  const formats = ["yyyy-MM-dd", "dd.MM.yyyy"];
  for (const fmt of formats) {
    const d = parse(dateStr, fmt, new Date());
    if (!isNaN(d)) return startOfDay(d);
  }

  return null;
};

const getNextId = () => {
  if (db.data.entries.length === 0) return 100;
  return Math.max(...db.data.entries.map((e) => e.id)) + 1;
};

// --- COMMANDS ---

program
  .command("add")
  .description(t.get("commands.add.description"))
  .alias("a")
  .argument("[text]", t.get("commands.add.argText"))
  .option("-t, --tags <tags>", t.get("commands.add.optTags"), "")
  .option("-c, --clipboard", t.get("commands.add.optClipboard"))
  .option("-e, --encrypted", t.get("commands.add.optEncrypted"))
  .action(async (text, options) => {
    let content = text;
    if (options.clipboard) content = await clipboardy.read();

    if (!content || content.trim() === "")
      return console.error(chalk.red(t("errors.noContent")));

    const id = getNextId();
    let isEncrypted = false;

    if (options.encrypted) {
      const { password } = await inquirer.prompt([
        {
          type: "password",
          name: "password",
          message: t.get("prompts.setPassword"),
          mask: "*",
        },
      ]);
      vault.data.secrets[id] = encrypt(content.trim(), password);
      await vault.write();
      content = "*** ENCRYPTED ***";
      isEncrypted = true;
    }

    db.data.entries.push({
      id,
      content: isEncrypted ? content : content.trim(),
      tags: options.tags ? options.tags.split(",").map((t) => t.trim()) : [],
      timestamp: new Date().toISOString(),
      encrypted: isEncrypted,
      usageCount: 0,
    });
    await db.write();
    console.log(chalk.green(t.get("commands.add.success", { id })));
  });

program
  .command("find")
  .description(t.get("commands.find.description"))
  .alias("search")
  .alias("f")
  .argument("[query]", t.get("commands.find.argQuery"), "*")
  .option("-t, --table", t.get("commands.find.optTable"))
  .option("-d, --date <date>", t.get("commands.find.optDate"))
  .action((query, options) => {
    let filterDate = options.date ? parseSearchDate(options.date) : null;
    const regex = new RegExp(query.replace(/\*/g, ".*"), "i");

    const results = db.data.entries.filter((e) => {
      const matchText =
        regex.test(e.content) || e.tags.some((t) => regex.test(t));
      let matchDate = true;
      if (filterDate) {
        matchDate = isSameDay(new Date(e.timestamp), filterDate);
      }
      return matchText && matchDate;
    });

    if (results.length === 0)
      return console.log(chalk.yellow(t("commands.find.noMatches")));

    if (options.table) {
      const table = new Table({
        head: [
          chalk.cyan(t.get("commands.find.tableHeaders.id")),
          chalk.magenta(t.get("commands.find.tableHeaders.date")),
          chalk.magenta(t.get("commands.find.tableHeaders.tags")),
          chalk.white(t.get("commands.find.tableHeaders.usage")),
          chalk.white(t.get("commands.find.tableHeaders.content")),
        ],
        wordWrap: true,
      });
      results.forEach((e) =>
        table.push([
          e.id,
          new Date(e.timestamp).toLocaleDateString(),
          e.tags.join(", "),
          e.usageCount || 0,
          e.content,
        ]),
      );
      console.log(table.toString());
    } else {
      results.forEach((e) => {
        console.log(
          chalk.cyan(`ID: ${e.id}`) +
            chalk.gray(` | Usage: ${e.usageCount || 0} | `) +
            chalk.magenta(new Date(e.timestamp).toLocaleString()),
        );
        console.log(
          e.encrypted ? chalk.yellow(e.content) : chalk.white(e.content),
        );
        console.log(chalk.gray("---"));
      });
    }
  });

program
  .command("get")
  .description(t.get("commands.get.description"))
  .alias("g")
  .argument("<id>", t.get("commands.get.argId"))
  .option("-c, --clipboard", t.get("commands.get.optClipboard"))
  .action(async (id, options) => {
    const entry = db.data.entries.find((e) => e.id === parseInt(id));
    if (!entry) return console.error(chalk.red(t.get("errors.notFound")));

    let displayContent = entry.content;
    if (entry.encrypted) {
      const { password } = await inquirer.prompt([
        {
          type: "password",
          name: "password",
          message: t("prompts.enterPassword"),
          mask: "*",
        },
      ]);
      const decrypted = decrypt(vault.data.secrets[id], password);
      if (!decrypted)
        return console.error(chalk.red(t.get("errors.wrongPassword")));
      displayContent = decrypted;
    }

    entry.usageCount = (entry.usageCount || 0) + 1;
    await db.write();

    console.log(
      chalk.cyan(t.get("commands.get.header", { id, count: entry.usageCount })),
    );
    console.log(chalk.white(displayContent));

    if (options.clipboard) {
      await clipboardy.write(displayContent);
      console.log(chalk.green(t.get("commands.get.copied")));
    }
  });

program
  .command("edit")
  .description(t.get("commands.edit.description"))
  .alias("e")
  .argument("<id>", t.get("commands.edit.argId"))
  .action(async (id) => {
    const entryIndex = db.data.entries.findIndex((e) => e.id === parseInt(id));
    if (entryIndex === -1)
      return console.error(chalk.red(t("errors.notFound")));
    const entry = db.data.entries[entryIndex];
    let currentContent = entry.content;

    if (entry.encrypted) {
      const { password } = await inquirer.prompt([
        {
          type: "password",
          name: "password",
          message: t.get("prompts.editPassword"),
          mask: "*",
        },
      ]);
      currentContent = decrypt(vault.data.secrets[id], password);
      if (!currentContent)
        return console.error(chalk.red(t.get("errors.wrongPassword")));
    }

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "content",
        message: t("prompts.newContent"),
        default: currentContent,
      },
      {
        type: "input",
        name: "tags",
        message: t("prompts.newTags"),
        default: entry.tags.join(", "),
      },
    ]);

    if (entry.encrypted) {
      const { newPass } = await inquirer.prompt([
        {
          type: "password",
          name: "newPass",
          message: t("prompts.encryptionPassword"),
          mask: "*",
        },
      ]);
      vault.data.secrets[id] = encrypt(answers.content, newPass);
      await vault.write();
    } else {
      entry.content = answers.content;
    }
    entry.tags = answers.tags.split(",").map((t) => t.trim());
    await db.write();
    console.log(chalk.green(t.get("commands.edit.success")));
  });

program
  .command("tags")
  .description(t.get("commands.tags.description"))
  .action(() => {
    const tagMap = {};
    db.data.entries.forEach((e) =>
      e.tags.forEach((t) => (tagMap[t] = (tagMap[t] || 0) + 1)),
    );
    const table = new Table({
      head: [
        chalk.magenta(t.get("commands.tags.tableHeaders.tag")),
        chalk.cyan(t.get("commands.tags.tableHeaders.count")),
      ],
    });
    Object.entries(tagMap)
      .sort((a, b) => b[1] - a[1])
      .forEach((t) => table.push(t));
    console.log(table.toString());
  });

program
  .command("location")
  .description(t.get("commands.location.description"))
  .alias("loc")
  .action(() => console.log(chalk.cyan(`DB: ${dbPath}\nVault: ${vaultPath}`)));

program
  .command("delete")
  .description(t.get("commands.delete.description"))
  .alias("rm")
  .argument("<id>")
  .action(async (id) => {
    db.data.entries = db.data.entries.filter((e) => e.id !== parseInt(id));
    delete vault.data.secrets[id];
    await db.write();
    await vault.write();
    console.log(chalk.green(t.get("commands.delete.success")));
  });

program.parse();
