import React from "react";
import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
} from "recoil";

const customGPTModels = atom({
  key: "customGPTModels",
  default: [],
});

const models = selector({
  key: "models",
  get: ({ get }) => {
    return [
      {
        _id: "0",
        name: "ChatGPT",
        value: "chatgpt",
        model: "chatgpt",
      },
      {
        _id: "1",
        name: "CustomGPT",
        value: "chatgptCustom",
        model: "chatgptCustom",
      },
      {
        _id: "2",
        name: "BingAI",
        value: "bingai",
        model: "bingai",
      },
      {
        _id: "3",
        name: "Sydney",
        value: "sydney",
        model: "sydney",
      },
      {
        _id: "4",
        name: "ChatGPT",
        value: "chatgptBrowser",
        model: "chatgptBrowser",
      },
      ...get(customGPTModels),
    ];
  },
});

const modelsFilter = atom({
  key: "modelsFilter",
  default: {
    chatgpt: false,
    chatgptCustom: false,
    bingai: false,
    sydney: false,
    chatgptBrowser: false,
  },
});

const availableModels = selector({
  key: "availableModels",
  get: ({ get }) => {
    const m = get(models);
    const f = get(modelsFilter);
    return m.filter(({ model }) => f[model]);
  },
});
// const modelAvailable

export default {
  customGPTModels,
  models,
  modelsFilter,
  availableModels,
};
