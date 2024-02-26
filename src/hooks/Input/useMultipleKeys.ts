import { isJson } from '~/utils/json';

export default function useMultipleKeys(setUserKey: React.Dispatch<React.SetStateAction<string>>) {
  function getMultiKey(name: string, userKey: string) {
    if (isJson(userKey)) {
      const newKey = JSON.parse(userKey);
      return newKey[name];
    } else {
      return '';
    }
  }

  function setMultiKey(name: string, value: number | string | boolean, userKey: string) {
    let newKey = {};
    if (isJson(userKey)) {
      newKey = JSON.parse(userKey);
    }
    newKey[name] = value;

    setUserKey(JSON.stringify(newKey));
  }

  return { getMultiKey, setMultiKey };
}
