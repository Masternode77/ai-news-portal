import net from 'node:net';

export function normalizeNetworkHost(value = '') {
  return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function ipv4Number(address = '') {
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((value) => !/^\d{1,3}$/.test(value) || Number(value) > 255)) return null;
  return octets.reduce((total, value) => ((total << 8) | Number(value)) >>> 0, 0);
}

function ipv4In(address, base, prefix) {
  const value = ipv4Number(address);
  const start = ipv4Number(base);
  if (value === null || start === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (start & mask);
}

function publicIpv4(address = '') {
  return ![
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ].some(([base, prefix]) => ipv4In(address, base, prefix));
}

function ipv6Words(address = '') {
  let input = normalizeNetworkHost(address);
  if (!input || input.includes('%')) return null;
  const dotted = input.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    const value = ipv4Number(dotted);
    if (value === null) return null;
    input = `${input.slice(0, -dotted.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = input.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 1 && halves.length === 2) return null;
  const words = [...left, ...Array(fill).fill('0'), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) return null;
  return words.map((word) => Number.parseInt(word, 16));
}

function ipv6In(words, base, prefix) {
  const baseWords = ipv6Words(base);
  if (!baseWords) return false;
  const wholeWords = Math.floor(prefix / 16);
  for (let index = 0; index < wholeWords; index += 1) {
    if (words[index] !== baseWords[index]) return false;
  }
  const remainingBits = prefix % 16;
  if (!remainingBits) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (words[wholeWords] & mask) === (baseWords[wholeWords] & mask);
}

// IANA IPv6 Global Unicast Address Space allocations, updated 2025-10-10.
// Unlisted 2000::/3 space is reserved for future allocation and fails closed.
const PUBLIC_IPV6_ALLOCATIONS = [
  ['2001:200::', 23], ['2001:400::', 23], ['2001:600::', 23], ['2001:800::', 22],
  ['2001:c00::', 23], ['2001:e00::', 23], ['2001:1200::', 23], ['2001:1400::', 22],
  ['2001:1800::', 23], ['2001:1a00::', 23], ['2001:1c00::', 22], ['2001:2000::', 19],
  ['2001:4000::', 23], ['2001:4200::', 23], ['2001:4400::', 23], ['2001:4600::', 23],
  ['2001:4800::', 23], ['2001:4a00::', 23], ['2001:4c00::', 23], ['2001:5000::', 20],
  ['2001:8000::', 19], ['2001:a000::', 20], ['2001:b000::', 20], ['2003::', 18],
  ['2400::', 12], ['2410::', 12], ['2600::', 12], ['2610::', 23], ['2620::', 23],
  ['2630::', 12], ['2800::', 12], ['2a00::', 12], ['2a10::', 12], ['2c00::', 12],
];

const SPECIAL_IPV6_WITHIN_PUBLIC_ALLOCATIONS = [
  ['2001:db8::', 32],
  ['2620:4f:8000::', 48],
];

function publicIpv6(address = '') {
  const words = ipv6Words(address);
  if (!words) return false;
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return false;
  }
  if (SPECIAL_IPV6_WITHIN_PUBLIC_ALLOCATIONS.some(([base, prefix]) => ipv6In(words, base, prefix))) return false;
  return PUBLIC_IPV6_ALLOCATIONS.some(([base, prefix]) => ipv6In(words, base, prefix));
}

export function isPublicNetworkAddress(address = '') {
  const normalized = normalizeNetworkHost(address);
  const family = net.isIP(normalized);
  if (family === 4) return publicIpv4(normalized);
  if (family === 6) return publicIpv6(normalized);
  return false;
}
