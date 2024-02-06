export const config = {
    onError: e => console.error(e),
};
export const setConfig = (conf) => {
    Object.assign(config, conf);
};
