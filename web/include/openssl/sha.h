#pragma once

#include "host_digest.h"

inline unsigned char *SHA1(const unsigned char *data, size_t len, unsigned char *out) {
  uint32_t h[5] = {0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0};
  sim_digest::Stream s;
  auto block = [&h](const uint8_t *b) { sim_digest::sha1Block(h, b); };
  s.update(data, len, block);
  s.finish(true, block);
  for (int i = 0; i < 5; ++i) sim_digest::putBe32(out + 4 * i, h[i]);
  return out;
}

inline unsigned char *SHA256(const unsigned char *data, size_t len, unsigned char *out) {
  uint32_t h[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  sim_digest::Stream s;
  auto block = [&h](const uint8_t *b) { sim_digest::sha256Block(h, b); };
  s.update(data, len, block);
  s.finish(true, block);
  for (int i = 0; i < 8; ++i) sim_digest::putBe32(out + 4 * i, h[i]);
  return out;
}
