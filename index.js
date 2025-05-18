import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import { MongoClient, ServerApiVersion } from 'mongodb';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Connect to MongoDB with retry logic
const connectWithRetry = async () => {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err);
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

async function getMedibotResponse(userMessage) {
  console.log("User message:", userMessage);
  try {
    // The bbok document. 
    // https://book-business-custom-chatbot.onrender.com/


    // The medical document.
    // https://chat-pdf-8h3c.onrender.com/query
    const response = await fetch("https://book-business-custom-chatbot.onrender.com/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: userMessage
      })
    });
    console.log(response)

    if (!response.ok) {
      throw new Error(`Medibot API request failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log("Medibot response:", data);
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error) {
    console.error("Error getting Medibot response:", error);
    throw error;
  }
}

// Collections (uncomment when needed)
// const userCollection = client.db("test").collection("users");
// const placedProducts = client.db("test").collection("userAndProducts");
// const authentication = client.db("test").collection("authentication");

// Webhook Handlers
app.post("/webhook", async (req, res) => {
  let body = req.body;

  console.log(`\u{1F7EA} Received webhook:`);
  console.dir(body, { depth: null });
    
  if (body.object === "page") {
    // Process entries in parallel
    const processing = body.entry.map(async (entry) => {
      await Promise.all(entry.messaging.map(async (event) => {
        if (event.message) {
          console.log("Received message:", event.message);
          await handleMessage(event);
        } else if (event.postback) {
          console.log("Received postback:", event.postback);
          // Handle postback here if needed
        }
      }));
    });

    await Promise.all(processing);
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});



async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;
  
  console.log(`Received message from ${senderId}:`, message.text);
  
  try {
    console.log("Processing message:", message.text);
    const response = await getMedibotResponse(message.text);
    // console.log("Chatbot response:", response.result);
    await sendTextMessage(senderId, response.result);
  } catch (error) {
    console.error('Failed to send reply:', error);
  }
}

async function sendTextMessage(recipientId, messageText) {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText }
  };

  await callSendAPI(messageData);
}

async function callSendAPI(messageData) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v12.0/me/messages?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageData),
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log("Successfully sent message with id %s to recipient %s", 
        data.message_id, data.recipient_id);
    } else {
      console.error("Failed to send message:", data.error);
      throw new Error(data.error.message);
    }
  } catch (error) {
    console.error("API request failed:", error);
    throw error;
  }
}

// Webhook Verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  
  if (mode && token) {
    if (mode === "subscribe" && token === process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }
  return res.sendStatus(400);
});

// Health Check
app.get("/", async (req, res) => {
  
  try {
    res.status(200).json({
      status: "Chatbot server is running successfully!",
    });
  } catch (error) {
    console.error("Error in health check:", error);
    res.status(500).json({
      status: "Error",
      message: error.message
    });
  }
});

// Start Server
const PORT = process.env.PORT || 2000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});