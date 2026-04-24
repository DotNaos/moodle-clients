export type MoodleClientSession = {
  moodleSiteUrl: string;
  moodleUserId: number;
  moodleMobileToken: string;
};

export type MoodleClientTarget = "web" | "mobile" | "extension";
