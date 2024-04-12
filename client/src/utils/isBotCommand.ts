export enum COMMAND {
  BOT = '/bot ',
}

const isBotCommand = (text: string) => {
  return text.startsWith(COMMAND.BOT);
};

export default isBotCommand;
