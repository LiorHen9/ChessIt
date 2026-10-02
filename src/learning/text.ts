import { byGender, type Profile } from '../profiles/profiles';
import type { AgeText } from './types';

/** Resolve `{male|female}` and `{male|female|neutral}` tokens for the profile. */
export function gendered(text: string, profile: Profile): string {
  return text.replace(/\{([^{}|]*)\|([^{}|]*)(?:\|([^{}|]*))?\}/g, (_m, male: string, female: string, neutral?: string) =>
    byGender(profile, male, female, neutral)
  );
}

/** The text for the profile's age group, with gendered words resolved. */
export function say(text: AgeText, profile: Profile): string {
  return gendered(text[profile.ageGroup] ?? text.teenAdult, profile);
}
