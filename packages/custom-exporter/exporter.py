from datetime import datetime, timedelta
import os
import time
import logging
from pymongo import MongoClient
from prometheus_client import start_http_server, Gauge, Counter, REGISTRY

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/LibreChat")
DB_NAME = os.getenv("MONGODB_DATABASE", "LibreChat")
PORT = int(os.getenv("PORT", 8000))
SCRAPE_INTERVAL = int(os.getenv("SCRAPE_INTERVAL", 15))
ACTIVE_USER_THRESHOLD = int(os.getenv("ACTIVE_USER_THRESHOLD", 1))

# Connect to MongoDB
try:
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    logger.info(f"Connected to MongoDB: {DB_NAME}")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    exit(1)

# --- DEFINING CUSTOM METRICS ---

# 1. Total number of registered users
TOTAL_USERS = Gauge('librechat_users_total', 'Total number of registered users')

# 2. Total number of conversations
TOTAL_CONVERSATIONS = Gauge('librechat_conversations_total', 'Total number of conversations')

# 3. Total number of user prompts sent
TOTAL_PROMPTS = Gauge('librechat_prompts_total', 'Total number of user prompts sent')

# 4. Number of prompts per user
USER_PROMPTS = Gauge('librechat_user_prompts', 'Number of prompts per user', ['user_name'])

# 5. Number of conversations per user
USER_CONVERSATIONS = Gauge('librechat_user_conversations', 'Number of conversations per user', ['user_name'])

# 6. Timestamp of last activity (prompt) per user
USER_LAST_ACTIVITY = Gauge('librechat_user_last_activity_timestamp', 'Timestamp of last user prompt', ['user_name'])



def collect_metrics():
    """
    Main loop to query MongoDB and update Prometheus metrics.
    Add your custom queries here.
    """
    try:
        # --- QUERY 1: Total Users ---
        user_count = db.users.count_documents({})
        TOTAL_USERS.set(user_count)

        # --- QUERY 2: Total Conversations ---
        conv_count = db.conversations.count_documents({})
        TOTAL_CONVERSATIONS.set(conv_count)

        # --- QUERY 3: Total Prompts ---
        prompt_count = db.transactions.count_documents({"tokenType": "prompt", "context": "message"})
        TOTAL_PROMPTS.set(prompt_count)

        # --- QUERY 4: User Prompts (joined with users) ---
        pipeline_prompts = [
            {"$match": {"tokenType": "prompt", "context": "message"}},
            {"$group": {"_id": "$user", "count": {"$sum": 1}}},
            {"$lookup": {
                "from": "users",
                "localField": "_id",
                "foreignField": "_id",
                "as": "user_info"
            }},
            {"$unwind": "$user_info"},
            {"$project": {"user_name": "$user_info.name", "count": 1}}
        ]
        
        user_prompt_agg = db.transactions.aggregate(pipeline_prompts)
        for doc in user_prompt_agg:
            name = doc.get('user_name', 'Unknown')
            count = doc.get('count', 0)
            USER_PROMPTS.labels(user_name=name).set(count)

        # --- QUERY 5: User Conversations (joined with users) ---
        # Note: conversions.user is a string, users._id is ObjectId. 
        # Ideally they should match types. If conversations.user acts as _id reference string, we need to convert.
        pipeline_convos = [
             {"$addFields": {
                "userObjId": { "$toObjectId": "$user" }
            }},
            {"$group": {"_id": "$userObjId", "count": {"$sum": 1}}},
            {"$lookup": {
                "from": "users",
                "localField": "_id",
                "foreignField": "_id",
                "as": "user_info"
            }},
            {"$unwind": "$user_info"},
            {"$project": {"user_name": "$user_info.name", "count": 1}}
        ]

        # Fallback if conversion fails (e.g. if user field isn't a valid ObjectId string), wrap in try/catch in Python or handle in pipeline
        try:
             user_conv_agg = db.conversations.aggregate(pipeline_convos)
             for doc in user_conv_agg:
                name = doc.get('user_name', 'Unknown')
                count = doc.get('count', 0)
                USER_CONVERSATIONS.labels(user_name=name).set(count)
        except Exception as e:
            logger.warning(f"Error aggregating user conversations: {e}")

        # --- QUERY 6: Last User Activity (Timestamp) ---
        pipeline_activity = [
            {"$match": {"tokenType": "prompt", "context": "message"}},
            {"$group": {
                "_id": "$user", 
                "last_active": {"$max": "$createdAt"}
            }},
            {"$lookup": {
                "from": "users",
                "localField": "_id",
                "foreignField": "_id",
                "as": "user_info"
            }},
            {"$unwind": "$user_info"},
            {"$project": {
                "user_name": "$user_info.name", 
                "last_active": 1
            }}
        ]

        try:
            # Convert cursor to list to debug count and content
            user_activity_agg = list(db.transactions.aggregate(pipeline_activity))
            logger.info(f"Debug: Found {len(user_activity_agg)} user activity records")
            
            for doc in user_activity_agg:
                name = doc.get('user_name', 'Unknown')
                last_active = doc.get('last_active')
                
                # MongoDB aggregation often returns datetime objects for date fields
                if isinstance(last_active, datetime):
                    timestamp = last_active.timestamp()
                    USER_LAST_ACTIVITY.labels(user_name=name).set(timestamp)
                    logger.info(f"Set last_activity for {name}: {timestamp}")
                else:
                    logger.warning(f"Skipping user {name}: last_active is {type(last_active)} - {last_active}")

        except Exception as e:
             logger.warning(f"Error aggregating user activity: {e}")
        
        # We need to handle the join carefully because of ObjectId vs String mismatch often found in LibreChat
        # The lookup above tries to handle it, but a simpler valid lookup is better if we are sure of types.
        # Let's use the same lookup strategy as QUERY 4 which seemed to work for prompts.
        

        logger.info(f"Scraped metrics: Users={user_count}, Prompts={prompt_count}")

    except Exception as e:
        logger.error(f"Error collecting metrics: {e}")


if __name__ == "__main__":
    # Start the Prometheus HTTP server
    start_http_server(PORT)
    logger.info(f"Prometheus exporter running on port {PORT}")
    
    # Main Loop
    while True:
        collect_metrics()
        time.sleep(SCRAPE_INTERVAL)
