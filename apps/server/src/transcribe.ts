import { AssemblyAI } from "assemblyai"
import { env } from "@my-better-t-app/env/server"

const client = new AssemblyAI({ apiKey: env.ASSEMBLY_AI_API_KEY })

export const transcribeAudio = async (audioBuffer: Buffer): Promise<string> => {
  // Upload the buffer to AssemblyAI's servers first, then transcribe
  const uploadUrl = await client.files.upload(audioBuffer)

  const transcript = await client.transcripts.transcribe({
    audio: uploadUrl,
    language_code: "en",
  })

  if (transcript.status === "error") {
    throw new Error(`Transcription failed: ${transcript.error}`)
  }

  return transcript.text ?? ""
}
