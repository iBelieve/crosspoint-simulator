#pragma once

#include "host_digest.h"

struct MD5_CTX {
  uint32_t h[4];
  sim_digest::Stream s;
};

inline int MD5_Init(MD5_CTX *c) {
  *c = MD5_CTX{{0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476}, {}};
  return 1;
}

inline int MD5_Update(MD5_CTX *c, const void *data, size_t len) {
  c->s.update(static_cast<const uint8_t *>(data), len, [c](const uint8_t *b) { sim_digest::md5Block(c->h, b); });
  return 1;
}

inline int MD5_Final(unsigned char *out, MD5_CTX *c) {
  c->s.finish(false, [c](const uint8_t *b) { sim_digest::md5Block(c->h, b); });
  for (int i = 0; i < 16; ++i) out[i] = static_cast<uint8_t>(c->h[i / 4] >> (8 * (i % 4)));
  return 1;
}
