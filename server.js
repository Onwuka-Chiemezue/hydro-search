require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json()); 

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Missing MONGO_URI in .env");
  process.exit(1);
}

let db, lessonsCollection, ordersCollection;


MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log("✅ Connected to MongoDB Atlas");

    db = client.db("hydroDB");
    lessonsCollection = db.collection("lessons");
    ordersCollection = db.collection("orders");

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  });


app.get('/api/lessons', async (req, res) => {
  try {
    const lessons = await lessonsCollection.find().toArray();
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/lessons/:id', async (req, res) => {
  try {
    const lesson = await lessonsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json(await lessonsCollection.find().toArray());

    const regex = new RegExp(q, "i");
    let query = { $or: [{ title: regex }, { location: regex }] };
    if (!isNaN(q)) query.$or.push({ price: Number(q) }, { availableInventory: Number(q) });

    const results = await lessonsCollection.find(query).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/seed', async (req, res) => {
  try {
    const sample = [
      { title: 'English Language', location: 'BIRMINGHAM', price: 2000, availableInventory: 7, description: 'Dive in and uplift your English literature.', continent: 'Europe', image: 'images/ukflag.webp' },
      { title: 'French', location: 'PARIS', price: 1800, availableInventory: 5, description: 'Learn rich French dialects.', continent: 'Europe', image: 'images/frenchflag.webp' },
      { title: 'Spanish', location: 'MADRID', price: 1800, availableInventory: 7, description: 'Learn Spanish dialects.', continent: 'Europe', image: 'images/spanishflag.webp' },
      { title: 'Chinese', location: 'HONG-KONG', price: 1800, availableInventory: 10, description: 'Learn Chinese dialects.', continent: 'Asia', image: 'images/chineseflag.webp' },
      { title: 'Mauritian Creole', location: 'Flic-en-Flac', price: 1500, availableInventory: 10, description: 'Learn Mauritian dialects.', continent: 'Africa', image: 'images/mauritiusflag.webp' }
    ];

    const inserted = await lessonsCollection.insertMany(sample);
    res.json({ inserted: inserted.insertedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/orders', async (req, res) => {
  try {
    const { name, phoneNumber, address, city, state, zip, lessonIDs, numberOfSpaces } = req.body;

    if (!name || !phoneNumber || !address || !city || !state || !zip || !lessonIDs || !numberOfSpaces) {
      return res.status(400).json({ error: "All fields are required." });
    }

   
    const lessonCountMap = {};
    for (const id of lessonIDs) lessonCountMap[id] = (lessonCountMap[id] || 0) + 1;

    const objectIds = Object.keys(lessonCountMap).map(id => new ObjectId(id));
    const lessons = await lessonsCollection.find({ _id: { $in: objectIds } }).toArray();

    
    for (const lesson of lessons) {
      const needed = lessonCountMap[lesson._id.toString()];
      if (lesson.availableInventory < needed) {
        return res.status(400).json({
          error: `Not enough spaces for '${lesson.title}'. Needed: ${needed}, Available: ${lesson.availableInventory}`
        });
      }
    }

  
    for (const lesson of lessons) {
      const needed = lessonCountMap[lesson._id.toString()];
      await lessonsCollection.updateOne({ _id: lesson._id }, { $inc: { availableInventory: -needed } });
    }

    const lessonNames = [];
    for (const lesson of lessons) {
      const repeat = lessonCountMap[lesson._id.toString()];
      for (let i = 0; i < repeat; i++) lessonNames.push(lesson.title);
    }

    const order = {
      name,
      phoneNumber,
      address,
      city,
      state,
      zip,
      lessonIDs: objectIds,
      lessonNames,
      numberOfSpaces,
      createdAt: new Date()
    };

    const saved = await ordersCollection.insertOne(order);

    res.json({
      message: "Order saved and inventory updated.",
      orderId: saved.insertedId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.put('/api/lessons/:id', async (req, res) => {
  try {
    const lessonId = req.params.id;
    const updatedFields = req.body;

    const result = await lessonsCollection.findOneAndUpdate(
      { _id: new ObjectId(lessonId) },
      { $set: updatedFields },
      {
        returnDocument: "after",
        upsert: false   // ← IMPORTANT FIX
      }
    );

    if (!result.value) {
      return res.status(404).json({ error: "Lesson not found." });
    }

    res.json({
      message: "Lesson updated.",
      lesson: result.value
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

