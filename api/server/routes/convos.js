const express = require("express");
const router = express.Router();
const { titleConvo } = require("../../app/");
const { getConvo, saveConvo, getConvoTitle } = require("../../models");
const {
  getConvosByPage,
  deleteConvos,
  updateConvo,
} = require("../../models/Conversation");
const { getMessages } = require("../../models/Message");

router.get("/", async (req, res) => {
  const pageNumber = req.query.pageNumber || 1;
  res
    .status(200)
    .send(await getConvosByPage(req?.session?.user?.username, pageNumber));
});

router.post("/clear", async (req, res) => {
  let filter = {};
  const { conversationId } = req.body.arg;
  if (conversationId) {
    filter = { conversationId };
  }

  try {
    const dbResponse = await deleteConvos(req?.session?.user?.username, filter);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.post("/update", async (req, res) => {
  const update = req.body.arg;

  try {
    const dbResponse = await updateConvo(req?.session?.user?.username, update);
    res.status(201).send(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

router.get("/:conversationId", async (req, res) => {
  const { conversationId } = req.params;
  res
    .status(200)
    .send(await getConvo(req?.session?.user?.username, conversationId));
});

module.exports = router;
