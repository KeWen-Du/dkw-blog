export interface Post {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  content: string;
  readingTime: number;
  series?: {
    slug: string;
    title: string;
    order: number;
  };
}

export interface Series {
  slug: string;
  title: string;
  description: string;
  posts: Post[];
}

export interface Archive {
  [year: string]: Post[];
}

export interface Metadata {
  title: string;
  description: string;
  openGraph?: {
    title: string;
    description: string;
    type: string;
    publishedTime: string;
    tags: string[];
  };
}