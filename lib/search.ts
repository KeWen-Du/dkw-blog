import { getAllPosts } from './posts';
import { Post } from './types';

function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

function isFuzzyMatch(text: string, query: string, threshold: number = 2): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  if (lowerText.includes(lowerQuery)) {
    return true;
  }

  const words = lowerText.split(/\s+/);
  for (const word of words) {
    if (levenshteinDistance(word, lowerQuery) <= threshold) {
      return true;
    }
  }

  return false;
}

export async function searchPosts(query: string): Promise<Post[]> {
  const posts = await getAllPosts();

  if (!query.trim()) {
    return [];
  }

  const results = posts.map((post) => {
    let score = 0;
    
    if (post.title.toLowerCase().includes(query.toLowerCase())) {
      score += 10;
    } else if (isFuzzyMatch(post.title, query)) {
      score += 5;
    }

    if (post.excerpt.toLowerCase().includes(query.toLowerCase())) {
      score += 5;
    } else if (isFuzzyMatch(post.excerpt, query)) {
      score += 2;
    }

    const matchingTags = post.tags.filter((tag) => 
      tag.toLowerCase().includes(query.toLowerCase()) || isFuzzyMatch(tag, query)
    );
    score += matchingTags.length * 3;

    return { post, score };
  })
  .filter((result) => result.score > 0)
  .sort((a, b) => b.score - a.score)
  .map((result) => result.post);

  return results;
}