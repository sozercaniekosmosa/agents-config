const fs = require('fs');
const path = require('path');

const TARGET_DIR = process.argv[2] || path.join(process.cwd(), 'src');

const PATTERNS = [
  {
    name: 'Ручная подписка на кэш (getQueryCache().subscribe)',
    regex: /getQueryCache\(\)\.subscribe/g,
    description: 'Обход встроенной реактивности TanStack Query, усложняет стейт-менеджмент.'
  },
  {
    name: 'Каскадные запросы (fetchQuery в цикле)',
    regex: /(while|for)\s*\(.*?\)\s*\{[\s\S]*?fetchQuery/g,
    description: 'Потенциальная проблема N+1 запросов при загрузке древовидных или связанных данных.'
  },
  {
    name: 'Ручное чанкирование запросов (i += N)',
    regex: /i\s*\+=\s*\d+/g,
    description: 'Вероятный обход лимитов сети (например, 429 от Nginx). Оптимизация должна происходить на BFF.'
  },
  {
    name: 'Ручная фильтрация ответов бэкенда',
    regex: /\.then\(.*?\.filter\(/g,
    description: 'UI фильтрует лишние данные, возвращаемые API (Over-fetching). Должно обрезаться на слое BFF.'
  }
];

function walkSync(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      if (!dirFile.includes('node_modules') && !dirFile.includes('.git') && !dirFile.includes('dist')) {
        filelist = walkSync(dirFile, filelist);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        filelist.push(dirFile);
      }
    }
  });
  return filelist;
}

console.log(`\n🔍 Сканирование директории: ${TARGET_DIR} ...\n`);

const files = walkSync(TARGET_DIR);
const results = {};

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  
  PATTERNS.forEach(pattern => {
    if (content.match(pattern.regex)) {
      if (!results[file]) results[file] = [];
      results[file].push({ name: pattern.name, desc: pattern.description });
    }
  });
});

console.log('--- BFF Audit Report ---\n');
if (Object.keys(results).length === 0) {
  console.log('✅ Проблемных мест не найдено.');
} else {
  Object.entries(results).forEach(([file, issues]) => {
    const relativePath = path.relative(process.cwd(), file);
    console.log(`📄 ${relativePath}`);
    issues.forEach(issue => {
      console.log(`  ❌ ${issue.name}`);
      console.log(`     💡 ${issue.desc}`);
    });
    console.log('');
  });
  
  console.log('------------------------');
  console.log('🎯 Рекомендация: Добавьте проблемные компоненты в .agents/skills/bff/debt/debt.md для планирования архитектурного рефакторинга.');
}
