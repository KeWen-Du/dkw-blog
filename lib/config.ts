export const siteConfig = {
  title: 'dkw-blog',
  description: '个人技术博客',
  url: 'https://dkw-blog.vercel.app',
  author: {
    name: 'KeWen Du',
    email: '',
  },
  social: {
    github: 'https://github.com/KeWen-Du',
    twitter: '',
    linkedin: '',
  },
  postPerPage: 10,
} as const;

export const ROUTES = {
  HOME: '/',
  POSTS: '/posts',
  ABOUT: '/about',
  ARCHIVE: '/archive',
  TAGS: '/tags',
  SEARCH: '/search',
} as const;

export const TAG_COLORS = [
  'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
  'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200',
  'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
  'bg-pink-100 dark:bg-pink-900 text-pink-800 dark:text-pink-200',
] as const;