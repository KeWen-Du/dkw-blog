export interface Post {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  content: string;
  readingTime: number;
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