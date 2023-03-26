const express = require("express");
const session = require("express-session");
const dbConnect = require("../models/dbConnect");
const { migrateDb } = require("../models");
const path = require("path");
const cors = require("cors");
const routes = require("./routes");
const app = express();
const port = process.env.PORT || 3080;
const host = process.env.HOST || "localhost";
const userSystemEnabled = process.env.ENABLE_USER_SYSTEM || false;
const projectPath = path.join(__dirname, "..", "..", "client");
dbConnect().then(() => {
  console.log("Connected to MongoDB");
  migrateDb();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(projectPath, "public")));
app.set("trust proxy", 1); // trust first proxy
app.use(
  session({
    secret: "chatgpt-clone-random-secrect",
    resave: false,
    saveUninitialized: true,
  })
);

app.get("/api/me", function (req, res) {
  if (userSystemEnabled) {
    const user = req?.session?.user;

    if (user)
      res.send(
        JSON.stringify({ username: user?.username, display: user?.display })
      );
    else res.send(JSON.stringify(null));
  } else {
    res.send(
      JSON.stringify({ username: "anonymous_user", display: "Anonymous User" })
    );
  }
});

app.use("/api/ask", routes.authenticatedOr401, routes.ask);
app.use("/api/messages", routes.authenticatedOr401, routes.messages);
app.use("/api/convos", routes.authenticatedOr401, routes.convos);
app.use("/api/customGpts", routes.authenticatedOr401, routes.customGpts);
app.use("/api/prompts", routes.authenticatedOr401, routes.prompts);
app.use("/auth", routes.auth);

app.get("/api/models", function (req, res) {
  const hasOpenAI = !!process.env.OPENAI_KEY;
  const hasChatGpt = !!process.env.CHATGPT_TOKEN;
  const hasBing = !!process.env.BING_TOKEN;

  res.send(JSON.stringify({ hasOpenAI, hasChatGpt, hasBing }));
});

app.get("/*", routes.authenticatedOrRedirect, function (req, res) {
  res.sendFile(path.join(projectPath, "public", "index.html"));
});

app.listen(port, host, () => {
  if (host == "0.0.0.0")
    console.log(
      `Server listening on all interface at port ${port}. Use http://localhost:${port} to access it`
    );
  else
    console.log(
      `Server listening at http://${
        host == "0.0.0.0" ? "localhost" : host
      }:${port}`
    );
});
