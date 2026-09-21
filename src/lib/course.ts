/**
 * Loads the kanji course (public/data/course.json, built by scripts/course.ts).
 */

import { useMemo } from 'react'

import type { Course } from './courseData.ts'

const COURSE_URL = `${import.meta.env.BASE_URL}data/course.json`

export async function loadCourse(): Promise<Course> {
  const response = await fetch(COURSE_URL)
  if (!response.ok) {
    throw new Error(
      `Could not load the course (HTTP ${response.status}). Expected it at ${COURSE_URL}.`,
    )
  }
  const course = (await response.json()) as Course
  if (!Array.isArray(course?.levels) || !course.kanji || !course.components) {
    throw new Error('The course file loaded but is missing levels or items.')
  }
  return course
}

/** Which kanji each component appears in, in course order. */
export function useUsedIn(course: Course): Map<string, string[]> {
  return useMemo(() => {
    const map = new Map<string, string[]>()
    for (const level of course.levels) {
      for (const char of level.kanji) {
        for (const part of course.kanji[char].parts) {
          const list = map.get(part) ?? []
          list.push(char)
          map.set(part, list)
        }
      }
    }
    return map
  }, [course])
}
