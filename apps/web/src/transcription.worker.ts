import { pipeline, env } from '@huggingface/transformers';

// Configure environment to fetch models from the HF CDN
env.allowLocalModels = false;

let transcriber: any = null;

async function getTranscriber(progress_callback: (data: any) => void) {
  if (!transcriber) {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback,
    });
  }
  return transcriber;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { audio } = event.data;
  if (!audio) return;

  try {
    const pipe = await getTranscriber((data: any) => {
      // Forward model download/loading progress to main thread
      if (data.status === 'progress') {
        self.postMessage({ 
          status: 'progress', 
          file: data.file, 
          progress: data.progress 
        });
      }
    });

    self.postMessage({ status: 'transcribing' });

    // Whisper expects Float32Array at 16000Hz mono
    const result = await pipe(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });

    self.postMessage({ status: 'completed', result });
  } catch (error: any) {
    console.error('Transcription Worker Error:', error);
    self.postMessage({ status: 'error', error: error.message || String(error) });
  }
});
