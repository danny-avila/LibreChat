export enum COMMAND {
  BOT = '/',
}

const isBotCommand = (text: string) => {
  return text.startsWith(COMMAND.BOT);
};

export default isBotCommand;
