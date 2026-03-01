import { getAllPosts } from './posts';
import { Archive } from './types';

export async function getPostsByYear(): Promise<Archive> {
  const posts = await getAllPosts();
  const archive: Archive = {};

  posts.forEach((post) => {
    const year = new Date(post.date).getFullYear().toString();
    if (!archive[year]) {
      archive[year] = [];
    }
    archive[year].push(post);
  });

  return archive;
}