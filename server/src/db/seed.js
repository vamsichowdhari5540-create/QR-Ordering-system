require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const adminModel = require('../models/adminModel');

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set, skipping admin seed.');
    return;
  }
  const existing = await adminModel.findByEmail(email);
  if (existing) {
    console.log('Admin already exists:', email);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await adminModel.createAdmin({
    email,
    passwordHash,
    name: "Vijay's FOOD POLITICS Owner",
    role: 'OWNER',
  });
  console.log('Seeded admin:', email);
}

async function seedServer() {
  const email = process.env.SEED_SERVER_EMAIL;
  const password = process.env.SEED_SERVER_PASSWORD;
  if (!email || !password) {
    console.log('SEED_SERVER_EMAIL / SEED_SERVER_PASSWORD not set, skipping server seed.');
    return;
  }
  const existing = await adminModel.findByEmail(email);
  if (existing) {
    console.log('Server account already exists:', email);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await adminModel.createAdmin({ email, passwordHash, name: 'Floor Server', role: 'SERVER' });
  console.log('Seeded server:', email);
}

async function seedKitchen() {
  const email = process.env.SEED_KITCHEN_EMAIL;
  const password = process.env.SEED_KITCHEN_PASSWORD;
  if (!email || !password) {
    console.log('SEED_KITCHEN_EMAIL / SEED_KITCHEN_PASSWORD not set, skipping kitchen seed.');
    return;
  }
  const existing = await adminModel.findByEmail(email);
  if (existing) {
    console.log('Kitchen account already exists:', email);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await adminModel.createAdmin({ email, passwordHash, name: 'Kitchen', role: 'KITCHEN' });
  console.log('Seeded kitchen:', email);
}

// The restaurant's actual printed menu card, transcribed category by category.
// Obvious card typos are corrected (Manchuriya -> Manchurian, Statars ->
// Starters, Curruy -> Curry, etc.); prices follow the card exactly, including
// handwritten corrections (Shahi Paneer, Mutton Semi Fry, Mutton Mughlai Curry).
const MENU = [
  {
    category: 'Veg Starters',
    items: [
      ['Gobi Roast', 170], ['Dragon Gobi', 200], ['Gobi Chilli', 200], ['Gobi Manchurian', 200],
      ['Mushroom Chilli', 210], ['Mushroom Manchurian', 210], ['Pepper Mushroom Roast', 220],
      ['Dragon Paneer', 240], ['Paneer Chilli', 250], ['Paneer 65', 220], ['Paneer Manchurian', 220],
      ['Crispy Corn', 240], ['Baby Corn Majestic', 210], ['Paneer Majestic', 240],
      ['Paneer Roast', 240], ['Kaju Roast', 240], ['Kaju Pakoda', 250],
    ],
  },
  {
    category: 'Egg Starters',
    items: [
      ['Omelette', 90], ['Masala Omelette', 100], ['Egg Cheese Omelette', 120],
      ['Egg Kheema Curry', 160], ['Fried Egg Masala', 170], ['Egg Burji', 110],
      ['Egg Roast', 150], ['Boiled Egg Fry', 150], ['Egg Chilli', 160],
    ],
  },
  {
    category: 'Veg Gravies',
    items: [
      ['Plain Palak', 140], ['Tomato Curry', 140], ['Dal Tomato', 145], ['Dal Curry', 145],
      ['Green Peas Curry', 140], ['Chana Curry', 160], ['Dal Tadka', 160], ['Gobi Curry', 160],
      ['Palak Paneer', 210], ['Gobi Kaju', 210], ['Mushroom Curry', 220], ['Shahi Paneer', 250],
      ['Methi Chaman', 230], ['Kaju Tomato', 240], ['Kadai Paneer', 240], ['Kaju Curry', 240],
      ['Kaju Paneer', 240], ['Kaju Mushroom', 250], ['Kaju Capsicum', 250], ['Kadai Mushroom', 260],
    ],
  },
  {
    category: 'Mutton Items',
    items: [
      ['Mutton Roast', 380], ['Pepper Mutton', 390], ['Mutton Semi Fry', 360],
      ['Mutton Mughlai Curry', 360], ['Mutton Curry', 320], ['Gongura Mutton Vepudu', 400],
      ['Gongura Mutton Curry', 420],
    ],
  },
  {
    category: 'Non-Veg Gravies',
    items: [
      ['Legpiece Curry (1 Piece)', 160], ['Bone Curry', 260], ['Chicken Boneless Curry', 270],
      ['Chicken Bone Mughlai', 300], ['Chicken Boneless Mughlai', 300], ['Andhra Chicken', 300],
      ['Butter Chicken', 300], ['Hyderabad Chicken', 300], ['Kadai Chicken', 300],
      ['Punjabi Chicken', 300], ['Ramba Chicken', 300], ['Nellore Chicken', 420],
      ['Maharani Chicken', 300], ['Kaju Chicken Curry', 300], ['Lollypop Curry', 300],
      ['Kashmiri Chicken', 300], ["Food Politics Spcl Chicken Curry", 420], ['Prawns Curry', 330],
      ['Chicken Kolhapuri', 300], ['Home Style Chicken Curry', 270], ['Home Style Mutton Curry', 320],
    ],
  },
  {
    category: 'Non-Veg Starters',
    items: [
      ['Legpiece Roast (3 Piece)', 240], ['Legpiece Fry (3 Pieces)', 240], ['Chicken Bone Roast', 250],
      ['Chicken Bone Semi Fry', 250], ['Chilli Chicken', 270], ['Chicken 65', 260],
      ['Chicken Boneless Roast', 300], ['Chicken Manchurian', 280], ['Lemon Chicken', 280],
      ['Chicken Boneless Semi Fry', 300], ['Pepper Chicken', 300], ['Lollypop Roast', 300],
      ['Chicken Lollipop Fry', 300], ['Chicken Egg Coating', 300], ['Kaju Chicken Semi Fry', 310],
      ['Tiger Chicken', 310], ['Bullet Chicken (Bone)', 300], ["Food Politics Spcl Chicken Roast", 420],
      ['Chicken Majestic', 300], ['Miriyala Kodi Vepudu', 270], ['Chicken Drumstick', 300],
      ['Crispy Chicken Fingers', 320], ['R.R. Chicken', 310], ['Prawns Chilli', 320],
      ['Prawns 65', 320], ['Prawns Semi Fry', 320], ['Prawns Roast', 320],
    ],
  },
  {
    category: 'Non-Veg Tandoori',
    items: [
      ['Tandoori Chicken Full', 650], ['Tandoori Chicken Half', 320], ['Chicken Tikka', 410],
      ['Chicken Achari Tikka', 340], ['Chicken Malai Tikka', 370], ['Murg Malai Tikka', 370],
      ['Tangdi Kebab Full', 410], ['Tangdi Kebab Half', 220], ['Reshmi Kebab', 340],
      ['Angara Kebab', 370], ['Cheese Chicken Tikka', 320], ['Prawns Tikka', 320],
      ['Chicken Seekh Kebab', 350],
    ],
  },
  {
    category: 'Veg Tandoori',
    items: [
      ['Paneer Tikka', 320], ['Malai Paneer Tikka', 340], ['Achari Paneer Tikka', 320],
      ['Haryani Paneer Tikka', 320], ['Ajwaini Paneer Tikka', 320], ['Paneer Seekh Kebab', 340],
      ['Veg Seekh Kebab', 310], ['Tandoori Stuffed Mushroom', 280],
    ],
  },
  {
    category: 'Biryani (Non-Veg)',
    items: [
      ['Egg Biryani', 210], ['Chicken Dum Biryani', 250], ['Chicken Fry Piece Biryani', 290],
      ['Chicken Spl Biryani (Boneless)', 300], ['Mutton Fry Piece Biryani', 370],
      ['Prawns Fry Biryani', 320], ['Plain Biryani (Non-Veg)', 170], ['White Rice Bowl', 70],
    ],
  },
  {
    category: 'Biryani (Veg)',
    items: [
      ['Veg Biryani', 210], ['Paneer Biryani', 240], ['Spcl Paneer Biryani', 270],
      ['Mushroom Biryani', 260], ['Cashew Biryani', 270], ['Jain Biryani Rice', 170],
    ],
  },
  {
    category: 'Veg Fried Rice',
    items: [
      ['Veg Fried Rice', 190], ['Paneer Fried Rice', 220], ['Gobi Fried Rice', 200],
      ['Kaju Fried Rice', 240], ['Kaju Paneer Fried Rice', 260], ['Kaju Mushroom Fried Rice', 260],
      ['Paneer Schezwan Fried Rice', 240], ['Schezwan Fried Rice', 200], ['Mushroom Fried Rice', 220],
    ],
  },
  {
    category: 'Non-Veg Fried Rice',
    items: [
      ['Egg Fried Rice', 180], ['Double Egg Fried Rice', 200], ['Chicken Fried Rice', 240],
      ['Schezwan Chicken Fried Rice', 240], ['Prawns Fried Rice', 280], ['Mixed Fried Rice', 280],
    ],
  },
  {
    category: 'Bread Items',
    items: [
      ['Roti', 10], ['Phulka', 10], ['Butter Roti', 50], ['Naan', 50], ['Butter Naan', 60],
      ['Garlic Naan', 80], ['Kulcha', 70], ['Masala Kulcha', 80], ['Tandoori Roti', 40],
    ],
  },
  { category: 'Desserts', items: [['Kheer', 120]] },
  { category: 'South Indian', items: [['Curd Rice', 100], ['Curd', 30]] },
];

async function seedMenu() {
  const [existing] = await pool.query('SELECT COUNT(*) AS n FROM categories');
  if (existing[0].n > 0) {
    console.log('Menu already seeded, skipping.');
    return;
  }

  const categories = MENU.map((c, i) => ({ name: c.category, displayOrder: i + 1 }));

  const categoryIds = {};
  for (const c of categories) {
    const [result] = await pool.query(
      'INSERT INTO categories (name, displayOrder) VALUES (:name, :displayOrder) RETURNING id',
      c
    );
    categoryIds[c.name] = result.insertId;
  }

  const items = MENU.flatMap((c) =>
    c.items.map(([name, basePrice]) => ({
      category: c.category,
      name,
      description: null,
      basePrice,
      variants: [],
      modifiers: [],
    }))
  );

  for (const item of items) {
    const [result] = await pool.query(
      `INSERT INTO items (categoryId, name, description, basePrice, displayOrder)
       VALUES (:categoryId, :name, :description, :basePrice, 1) RETURNING id`,
      { categoryId: categoryIds[item.category], ...item }
    );
    const itemId = result.insertId;

    for (const [i, v] of item.variants.entries()) {
      await pool.query(
        'INSERT INTO item_variants (itemId, name, priceModifier, displayOrder) VALUES (:itemId, :name, :priceModifier, :displayOrder)',
        { itemId, ...v, displayOrder: i }
      );
    }

    for (const [i, m] of item.modifiers.entries()) {
      const [modResult] = await pool.query(
        'INSERT INTO item_modifiers (itemId, name, type, displayOrder) VALUES (:itemId, :name, :type, :displayOrder) RETURNING id',
        { itemId, name: m.name, type: m.type, displayOrder: i }
      );
      const modifierId = modResult.insertId;
      for (const [j, optName] of m.options.entries()) {
        await pool.query(
          'INSERT INTO modifier_options (modifierId, name, displayOrder) VALUES (:modifierId, :name, :displayOrder)',
          { modifierId, name: optName, displayOrder: j }
        );
      }
    }
  }

  console.log(`Seeded ${categories.length} categories and ${items.length} items.`);
}

async function main() {
  await seedAdmin();
  await seedServer();
  await seedKitchen();
  await seedMenu();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
