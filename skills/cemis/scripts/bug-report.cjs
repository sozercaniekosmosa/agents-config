const readline = require("readline");
const fs = require("fs");
const path = require("path");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const BUGS_DIR = path.join(__dirname, "..", "bugs-report");

console.log("🛠 Генератор обращений по данным (CEMIS)");
console.log("⚠️ ВАЖНО: Указывайте только факты ошибок и ожидаемое поведение. Предлагать решения или задавать вопросы запрещено!\n");

rl.question("1. Контекст (узел, страница): ", (context) => {
  rl.question("2. Endpoint API / Тег / Элиас: ", (entity) => {
    rl.question("3. Проблема (факт): ", (issue) => {
      rl.question("4. Ожидаемый результат: ", (action) => {
        rl.question("5. Краткое название на английском (например, missing-current-power): ", (shortDesc) => {
          
          if (!fs.existsSync(BUGS_DIR)) {
            fs.mkdirSync(BUGS_DIR, { recursive: true });
          }

          const dateStr = new Date().toISOString().split("T")[0];
          const cleanDesc = shortDesc.trim().replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "bug";
          const fileName = `${dateStr}-${cleanDesc}.md`;
          const filePath = path.join(BUGS_DIR, fileName);
          
          const ctxStr = [context, entity].filter(Boolean).join(", ");
          const content = `Контекст: ${ctxStr}\nПроблема: ${issue}\nОжидание: ${action}\n`;
          
          fs.writeFileSync(filePath, content, "utf-8");

          console.log("\n=========================================");
          console.log(`✅ Баг-репорт сохранен: ${filePath}\n`);
          console.log("📝 Содержимое:\n");
          console.log(content);
          console.log("=========================================\n");
          
          rl.close();
        });
      });
    });
  });
});
