
export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export const githubService = {
  async pushToGitHub(config: GitHubConfig, data: any, message: string = 'SkyOPS: Automated Station Registry Update') {
    const { token, owner, repo, branch, path } = config;
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    try {
      // 1. Get the current file's SHA if it exists
      let sha: string | null = null;
      try {
        const fileRes = await fetch(`${baseUrl}/contents/${path}?ref=${branch}`, { headers });
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          sha = fileData.sha;
        }
      } catch (e) {
        console.log("File likely doesn't exist yet, starting fresh.");
      }

      // 2. Prepare content
      const content = btoa(JSON.stringify(data, null, 2));

      // 3. Update or Create file
      const updateRes = await fetch(`${baseUrl}/contents/${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message,
          content,
          sha: sha || undefined,
          branch
        })
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json();
        throw new Error(errData.message || 'GitHub Uplink Rejected');
      }

      return await updateRes.json();
    } catch (err: any) {
      console.error("GitHub Sync Error:", err);
      throw err;
    }
  }
};
