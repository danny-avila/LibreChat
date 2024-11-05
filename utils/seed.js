const { MongoClient } = require("mongodb");

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const database = client.db("LibreChat");
        const collection = database.collection("subscriptionPlans");

        const plans = [
            {
                name: "بیسیک",
                price: 1000000,
                durationInDays: 30,
                description: "مناسب برای کارهای روزمره",
                tokenCredits: 1000,
                features: ["تک پروژه", "صد سوال در ساعت", "آپلود فایل تا ده فایل", "پشتیبانی ۲۴ ساعته"],
                buttonLabel: "بسته شما"
            },
            {
                name: "استاندارد",
                price: 1600000,
                durationInDays: 30,
                description: "برای رشد و یادگیری",
                tokenCredits: 2000,
                features: ["۱۰ پروژه", "پشتیبانی و آموزش پرامپت نویسی", "مدل‌های ترین شده و آماده", "پشتیبانی ۲۴ ساعته"],
                buttonLabel: "خرید بسته"
            },
            {
                name: "پیشرفته کیو استار",
                price: 2500000,
                durationInDays: 30,
                description: "برای توسعه و عملیاتی",
                tokenCredits: 5000,
                features: ["۱۰۰۰ پروژه", "پشتیبانی و آموزش پرامپت نویسی", "مدل‌های ترین شده و آماده", "پشتیبانی ۲۴ ساعته"],
                buttonLabel: "خرید بسته"
            }
        ];

        const result = await collection.insertMany(plans);
        console.log(`${result.insertedCount} مدارک درج شد`);
    } finally {
        await client.close();
    }
}

run().catch(console.error);
