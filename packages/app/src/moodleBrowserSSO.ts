export type MoodleBrowserSSOLaunch = {
  siteUrl: string;
  passport: string;
  urlScheme: string;
};

export type MoodleBrowserSSOToken = {
  siteUrl: string;
  token: string;
  privateToken?: string;
};

export function isMoodleBrowserSSOTokenUrl(rawUrl: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\/token=/i.test(rawUrl.trim());
}

export function parseMoodleBrowserSSOToken(
  rawUrl: string,
  launch: MoodleBrowserSSOLaunch,
): MoodleBrowserSSOToken {
  const trimmed = rawUrl.trim().replace(/\/?(#.*)?\/?$/, "");
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\/token=(.+)$/i);
  if (!schemeMatch) {
    throw new Error("Moodle browser login callback is not a token URL.");
  }

  const callbackScheme = schemeMatch[1].toLowerCase();
  if (callbackScheme !== launch.urlScheme.toLowerCase() && callbackScheme !== "moodlemobile") {
    throw new Error(`Moodle browser login returned to an unexpected URL scheme: ${callbackScheme}.`);
  }

  const encodedPayload = decodeURIComponent(schemeMatch[2]);
  const decodedPayload = decodeBase64(encodedPayload);
  const parts = decodedPayload.split(":::");
  const signature = parts[0] ?? "";
  const token = parts[1] ?? "";
  const privateToken = parts[2] || undefined;

  if (!token) {
    throw new Error("Moodle browser login did not return a mobile token.");
  }

  const siteUrl = validateBrowserSSOSignature(signature, launch);
  return {
    siteUrl,
    token,
    privateToken,
  };
}

export function createPassport(): string {
  const randomValue = Math.random().toString(36).slice(2);
  return `${Date.now()}.${randomValue}`;
}

export function normalizeSiteRoot(siteUrl: string): string {
  return stripTrailingSlash(formatHttpUrl(siteUrl));
}

function validateBrowserSSOSignature(signature: string, launch: MoodleBrowserSSOLaunch): string {
  const primarySiteUrl = normalizeSiteRoot(launch.siteUrl);
  const primarySignature = md5Ascii(`${primarySiteUrl}${launch.passport}`);
  if (signature === primarySignature) {
    return primarySiteUrl;
  }

  const alternateSiteUrl = swapHttpProtocol(primarySiteUrl);
  const alternateSignature = md5Ascii(`${alternateSiteUrl}${launch.passport}`);
  if (signature === alternateSignature) {
    return alternateSiteUrl;
  }

  throw new Error("Moodle browser login signature did not match this device login request.");
}

function swapHttpProtocol(siteUrl: string): string {
  if (siteUrl.startsWith("https://")) {
    return siteUrl.replace("https://", "http://");
  }
  if (siteUrl.startsWith("http://")) {
    return siteUrl.replace("http://", "https://");
  }
  return siteUrl;
}

function decodeBase64(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const atobFn = (globalThis as { atob?: (input: string) => string }).atob;
  if (atobFn) {
    return atobFn(padded);
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let index = 0;

  while (index < padded.length) {
    const enc1 = alphabet.indexOf(padded.charAt(index++));
    const enc2 = alphabet.indexOf(padded.charAt(index++));
    const enc3 = alphabet.indexOf(padded.charAt(index++));
    const enc4 = alphabet.indexOf(padded.charAt(index++));
    if (enc1 < 0 || enc2 < 0 || enc3 < 0 || enc4 < 0) {
      throw new Error("Moodle browser login returned an invalid token payload.");
    }

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output += String.fromCharCode(chr1);
    if (enc3 !== 64) {
      output += String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output += String.fromCharCode(chr3);
    }
  }

  return output;
}

function formatHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Moodle site URL is empty.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function md5Ascii(input: string): string {
  function rotateLeft(value: number, shift: number): number {
    return (value << shift) | (value >>> (32 - shift));
  }

  function addUnsigned(left: number, right: number): number {
    return (left + right) >>> 0;
  }

  function roundF(x: number, y: number, z: number): number {
    return (x & y) | (~x & z);
  }

  function roundG(x: number, y: number, z: number): number {
    return (x & z) | (y & ~z);
  }

  function roundH(x: number, y: number, z: number): number {
    return x ^ y ^ z;
  }

  function roundI(x: number, y: number, z: number): number {
    return y ^ (x | ~z);
  }

  function transform(
    fn: (x: number, y: number, z: number) => number,
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    ac: number,
  ): number {
    return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, fn(b, c, d)), addUnsigned(x, ac)), s), b);
  }

  const words = convertAsciiToWordArray(input);
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let k = 0; k < words.length; k += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    a = transform(roundF, a, b, c, d, words[k + 0], 7, 0xd76aa478);
    d = transform(roundF, d, a, b, c, words[k + 1], 12, 0xe8c7b756);
    c = transform(roundF, c, d, a, b, words[k + 2], 17, 0x242070db);
    b = transform(roundF, b, c, d, a, words[k + 3], 22, 0xc1bdceee);
    a = transform(roundF, a, b, c, d, words[k + 4], 7, 0xf57c0faf);
    d = transform(roundF, d, a, b, c, words[k + 5], 12, 0x4787c62a);
    c = transform(roundF, c, d, a, b, words[k + 6], 17, 0xa8304613);
    b = transform(roundF, b, c, d, a, words[k + 7], 22, 0xfd469501);
    a = transform(roundF, a, b, c, d, words[k + 8], 7, 0x698098d8);
    d = transform(roundF, d, a, b, c, words[k + 9], 12, 0x8b44f7af);
    c = transform(roundF, c, d, a, b, words[k + 10], 17, 0xffff5bb1);
    b = transform(roundF, b, c, d, a, words[k + 11], 22, 0x895cd7be);
    a = transform(roundF, a, b, c, d, words[k + 12], 7, 0x6b901122);
    d = transform(roundF, d, a, b, c, words[k + 13], 12, 0xfd987193);
    c = transform(roundF, c, d, a, b, words[k + 14], 17, 0xa679438e);
    b = transform(roundF, b, c, d, a, words[k + 15], 22, 0x49b40821);

    a = transform(roundG, a, b, c, d, words[k + 1], 5, 0xf61e2562);
    d = transform(roundG, d, a, b, c, words[k + 6], 9, 0xc040b340);
    c = transform(roundG, c, d, a, b, words[k + 11], 14, 0x265e5a51);
    b = transform(roundG, b, c, d, a, words[k + 0], 20, 0xe9b6c7aa);
    a = transform(roundG, a, b, c, d, words[k + 5], 5, 0xd62f105d);
    d = transform(roundG, d, a, b, c, words[k + 10], 9, 0x02441453);
    c = transform(roundG, c, d, a, b, words[k + 15], 14, 0xd8a1e681);
    b = transform(roundG, b, c, d, a, words[k + 4], 20, 0xe7d3fbc8);
    a = transform(roundG, a, b, c, d, words[k + 9], 5, 0x21e1cde6);
    d = transform(roundG, d, a, b, c, words[k + 14], 9, 0xc33707d6);
    c = transform(roundG, c, d, a, b, words[k + 3], 14, 0xf4d50d87);
    b = transform(roundG, b, c, d, a, words[k + 8], 20, 0x455a14ed);
    a = transform(roundG, a, b, c, d, words[k + 13], 5, 0xa9e3e905);
    d = transform(roundG, d, a, b, c, words[k + 2], 9, 0xfcefa3f8);
    c = transform(roundG, c, d, a, b, words[k + 7], 14, 0x676f02d9);
    b = transform(roundG, b, c, d, a, words[k + 12], 20, 0x8d2a4c8a);

    a = transform(roundH, a, b, c, d, words[k + 5], 4, 0xfffa3942);
    d = transform(roundH, d, a, b, c, words[k + 8], 11, 0x8771f681);
    c = transform(roundH, c, d, a, b, words[k + 11], 16, 0x6d9d6122);
    b = transform(roundH, b, c, d, a, words[k + 14], 23, 0xfde5380c);
    a = transform(roundH, a, b, c, d, words[k + 1], 4, 0xa4beea44);
    d = transform(roundH, d, a, b, c, words[k + 4], 11, 0x4bdecfa9);
    c = transform(roundH, c, d, a, b, words[k + 7], 16, 0xf6bb4b60);
    b = transform(roundH, b, c, d, a, words[k + 10], 23, 0xbebfbc70);
    a = transform(roundH, a, b, c, d, words[k + 13], 4, 0x289b7ec6);
    d = transform(roundH, d, a, b, c, words[k + 0], 11, 0xeaa127fa);
    c = transform(roundH, c, d, a, b, words[k + 3], 16, 0xd4ef3085);
    b = transform(roundH, b, c, d, a, words[k + 6], 23, 0x04881d05);
    a = transform(roundH, a, b, c, d, words[k + 9], 4, 0xd9d4d039);
    d = transform(roundH, d, a, b, c, words[k + 12], 11, 0xe6db99e5);
    c = transform(roundH, c, d, a, b, words[k + 15], 16, 0x1fa27cf8);
    b = transform(roundH, b, c, d, a, words[k + 2], 23, 0xc4ac5665);

    a = transform(roundI, a, b, c, d, words[k + 0], 6, 0xf4292244);
    d = transform(roundI, d, a, b, c, words[k + 7], 10, 0x432aff97);
    c = transform(roundI, c, d, a, b, words[k + 14], 15, 0xab9423a7);
    b = transform(roundI, b, c, d, a, words[k + 5], 21, 0xfc93a039);
    a = transform(roundI, a, b, c, d, words[k + 12], 6, 0x655b59c3);
    d = transform(roundI, d, a, b, c, words[k + 3], 10, 0x8f0ccc92);
    c = transform(roundI, c, d, a, b, words[k + 10], 15, 0xffeff47d);
    b = transform(roundI, b, c, d, a, words[k + 1], 21, 0x85845dd1);
    a = transform(roundI, a, b, c, d, words[k + 8], 6, 0x6fa87e4f);
    d = transform(roundI, d, a, b, c, words[k + 15], 10, 0xfe2ce6e0);
    c = transform(roundI, c, d, a, b, words[k + 6], 15, 0xa3014314);
    b = transform(roundI, b, c, d, a, words[k + 13], 21, 0x4e0811a1);
    a = transform(roundI, a, b, c, d, words[k + 4], 6, 0xf7537e82);
    d = transform(roundI, d, a, b, c, words[k + 11], 10, 0xbd3af235);
    c = transform(roundI, c, d, a, b, words[k + 2], 15, 0x2ad7d2bb);
    b = transform(roundI, b, c, d, a, words[k + 9], 21, 0xeb86d391);

    a = addUnsigned(a, aa);
    b = addUnsigned(b, bb);
    c = addUnsigned(c, cc);
    d = addUnsigned(d, dd);
  }

  return [a, b, c, d].map(wordToHex).join("").toLowerCase();
}

function convertAsciiToWordArray(input: string): number[] {
  const length = input.length;
  const wordCount = (((length + 8) >> 6) + 1) * 16;
  const words = Array.from({ length: wordCount }, () => 0);
  for (let index = 0; index < length; index++) {
    words[index >> 2] |= input.charCodeAt(index) << ((index % 4) * 8);
  }

  words[length >> 2] |= 0x80 << ((length % 4) * 8);
  words[(((length + 8) >> 6) << 4) + 14] = length * 8;
  return words;
}

function wordToHex(value: number): string {
  let output = "";
  for (let index = 0; index <= 3; index++) {
    const byte = (value >>> (index * 8)) & 255;
    output += `0${byte.toString(16)}`.slice(-2);
  }
  return output;
}
