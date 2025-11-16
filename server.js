
const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const multer = require("multer");
const { program } = require("commander");


program
  .requiredOption("-h, --host <host>", "адреса сервера")
  .requiredOption("-p, --port <port>", "порт сервера")
  .requiredOption("-c, --cache <path>", "папка для кешу");

program.parse(process.argv);
const opts = program.opts();

const HOST = opts.host;
const PORT = Number(opts.port);
const CACHE = path.resolve(opts.cache);
const PHOTOS = path.join(CACHE, "photos");
const INVENTORY_FILE = path.join(CACHE, "inventory.json");

//Підготовка папок
if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
if (!fs.existsSync(PHOTOS)) fs.mkdirSync(PHOTOS, { recursive: true });
if (!fs.existsSync(INVENTORY_FILE)) fs.writeFileSync(INVENTORY_FILE, "[]");

//Робота з файлом інвентаря 
function loadInventory() {
  try {
    return JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveInventory(list) {
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(list, null, 2));
}

let inventory = loadInventory();

function findIndex(id) {
  return inventory.findIndex((item) => item.id === id);
}

//Налаштування для фото 
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTOS),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + Math.round(Math.random() * 999999) + ".jpg"),
});

const upload = multer({ storage });

//Створення додатку 
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//Видача HTML-форм 

// Форма реєстрації
app.get("/RegisterForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "RegisterForm.html"));
});

// Форма пошуку
app.get("/SearchForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "SearchForm.html"));
});

// Заборона інших методів
app.all("/RegisterForm.html", (req, res) => {
  if (req.method !== "GET") return res.status(405).send("Метод заборонено");
});
app.all("/SearchForm.html", (req, res) => {
  if (req.method !== "GET") return res.status(405).send("Метод заборонено");
});

//Додавання нової речі =====
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;

  // Перевірка назви
  if (!inventory_name || inventory_name.trim() === "") {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Потрібно вказати назву" });
  }

  // Генерація ID
  const id =
    inventory.length > 0
      ? Math.max(...inventory.map((i) => i.id)) + 1
      : 1;

  const item = {
    id,
    name: inventory_name.trim(),
    description: (description || "").trim(),
    photoFile: req.file ? req.file.filename : null,
  };

  inventory.push(item);
  saveInventory(inventory);

  res.status(201).json({
    id: item.id,
    name: item.name,
    description: item.description,
    photo: item.photoFile ? `/inventory/${item.id}/photo` : null,
  });
});

// Заборона інших методів
app.all("/register", (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Метод заборонено");
});

//Отримання всього списку 
app.get("/inventory", (req, res) => {
  const result = inventory.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    photo: item.photoFile ? `/inventory/${item.id}/photo` : null,
  }));
  res.status(200).json(result);
});

app.all("/inventory", (req, res) => {
  if (req.method !== "GET") return res.status(405).send("Метод заборонено");
});

//Отримання інформації про одну річ
app.get("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).send("Не знайдено");

  const index = findIndex(id);
  if (index === -1) return res.status(404).send("Не знайдено");

  const item = inventory[index];

  res.status(200).json({
    id: item.id,
    name: item.name,
    description: item.description,
    photo: item.photoFile ? `/inventory/${item.id}/photo` : null,
  });
});

//Оновлення полів речі 
app.put("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).send("Не знайдено");

  const index = findIndex(id);
  if (index === -1) return res.status(404).send("Не знайдено");

  const { name, description } = req.body;

  if (name !== undefined) inventory[index].name = name.trim();
  if (description !== undefined) inventory[index].description = description.trim();

  saveInventory(inventory);

  const item = inventory[index];

  res.status(200).json({
    id: item.id,
    name: item.name,
    description: item.description,
    photo: item.photoFile ? `/inventory/${item.id}/photo` : null,
  });
});

//Отримання фото
app.get("/inventory/:id/photo", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).send("Не знайдено");

  const index = findIndex(id);
  if (index === -1) return res.status(404).send("Не знайдено");

  const file = inventory[index].photoFile;
  if (!file) return res.status(404).send("Фото немає");

  const filePath = path.join(PHOTOS, file);
  if (!fs.existsSync(filePath)) return res.status(404).send("Фото немає");

  res.setHeader("Content-Type", "image/jpeg");
  res.status(200).sendFile(filePath);
});

//Оновлення фото 
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).send("Не знайдено");
  }

  const index = findIndex(id);
  if (index === -1) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).send("Не знайдено");
  }

  // Видалення старого фото
  const old = inventory[index].photoFile;
  if (old) {
    const oldPath = path.join(PHOTOS, old);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  inventory[index].photoFile = req.file.filename;
  saveInventory(inventory);

  const item = inventory[index];

  res.status(200).json({
    id: item.id,
    name: item.name,
    description: item.description,
    photo: `/inventory/${item.id}/photo`,
  });
});

//Видалення речі 
app.delete("/inventory/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).send("Не знайдено");

  const index = findIndex(id);
  if (index === -1) return res.status(404).send("Не знайдено");

  const photo = inventory[index].photoFile;
  if (photo) {
    const filePath = path.join(PHOTOS, photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  inventory.splice(index, 1);
  saveInventory(inventory);

  res.status(200).json({ message: "Видалено" });
});

// Пошук 
app.post("/search", (req, res) => {
  const { id, has_photo } = req.body;
  const numId = Number(id);

  if (!Number.isInteger(numId)) return res.status(404).send("Не знайдено");

  const index = findIndex(numId);
  if (index === -1) return res.status(404).send("Не знайдено");

  let desc = inventory[index].description;

  if (has_photo && inventory[index].photoFile) {
    desc += ` (Фото: /inventory/${numId}/photo)`;
  }

  res.status(200).json({
    id: inventory[index].id,
    name: inventory[index].name,
    description: desc,
  });
});

app.all("/search", (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Метод заборонено");
});

//Обмеження на методи 
app.all("/inventory/:id", (req, res, next) => {
  if (["GET", "PUT", "DELETE"].includes(req.method)) return next();
  return res.status(405).send("Метод заборонено");
});

app.all("/inventory/:id/photo", (req, res, next) => {
  if (["GET", "PUT"].includes(req.method)) return next();
  return res.status(405).send("Метод заборонено");
});

//404 для всіх інших
app.use((req, res) => res.status(404).send("Не знайдено"));

const server = http.createServer(app);
server.listen(PORT, HOST, () => {
  console.log(`Сервер працює: http://${HOST}:${PORT}`);
});
