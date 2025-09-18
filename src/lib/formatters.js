// добавляет в сообщение параметры
export const formatMessage = (message = '', arr = []) => {
  if (message && arr.length) {
    arr.forEach((value, index) => {
      const regExp = new RegExp(`\\{${index}\\}`, 'g');

      message = message.replace(regExp, value);
    });
  }

  return message;
};
