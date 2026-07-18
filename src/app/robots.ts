import type { MetadataRoute } from 'next';

/** App host: disallow crawling private product surfaces. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/login', '/register'],
        disallow: ['/'],
      },
    ],
  };
}
