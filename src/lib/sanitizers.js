const forbiddenCharsRegExp = new RegExp(`[<>|"'%;()&+-]`, 'g');

/**
 * Удаляет из строки запрещенные символы.
 * @param {string} message
 * @returns {string} - Очищенная строка.
 */
export const sanitizeMessage = message => {
  if (typeof message === 'string') {
    return message.replace(forbiddenCharsRegExp, '');
  }
};
