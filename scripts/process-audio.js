import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

import soundsConfig from '../src/config/sounds.js';

const execPromise = promisify(exec);

const sourceDir = 'src/assets/audio-raw';
const outputDir = 'public/sounds';

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aiff', '.ogg', '.m4a'];

// параметры громкости (EBU R128)
const LOUDNESS = {
  // I (Integrated Loudness): Целевая интегральная громкость
  // -16 LUFS - хороший баланс для игр и веб-контента
  I: -16,

  // LRA (Loudness Range): Динамический диапазон громкости
  // 7 LU - умеренный диапазон,
  // который сохраняет разницу между тихими и громкими звуками
  LRA: 7, // динамический диапазон

  // TP (True Peak): Максимальный истинный пик
  // -1.5 dBTP - безопасный предел, чтобы избежать искажений (клиппинга)
  TP: -1.5,
};

// параметры обрезки тишины в начале файла
const SILENCE_THRESHOLD = '-50dB';

// имена файлов зацикленных звуков (флаг loop в src/config/sounds.js)
const LOOP_FILES = new Set(
  Object.values(soundsConfig.sounds)
    .filter(sound => sound.loop)
    .map(sound => sound.file),
);

// параметры кодирования
const CODEC_SETTINGS = {
  MP3_QUALITY: '2', // VBR ~190kbps
  WEBM_BITRATE: '96k', // битрейт Opus
};

// проверка установки ffmpeg
async function isFfmpegInstalled() {
  try {
    await execPromise('ffmpeg -version');
    return true;
  } catch (error) {
    return false;
  }
}

// однопроходный loudnorm — динамический нормализатор: он гуляет по громкости
// внутри файла, из-за чего концы петли расходятся по уровню. Для зацикленных
// звуков нужен второй проход: с измеренными значениями коррекция линейная.
async function measureLoudness(sourcePath) {
  const command = [
    'ffmpeg',
    '-nostdin',
    `-i "${sourcePath}"`,
    '-hide_banner -y',
    `-af "loudnorm=I=${LOUDNESS.I}:LRA=${LOUDNESS.LRA}:tp=${LOUDNESS.TP}:print_format=json"`,
    '-f null -',
  ].join(' ');

  // проход идёт на info-логе (иначе не будет JSON) и печатает прогресс
  // декодирования — дефолтного 1 МБ буфера длинному файлу не хватит
  const { stderr } = await execPromise(command, { maxBuffer: 10 * 1024 * 1024 });
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');

  if (start === -1 || end < start) {
    throw new Error(`loudnorm measurement failed for ${sourcePath}`);
  }

  return JSON.parse(stderr.slice(start, end + 1));
}

// цепочка аудиофильтров для файла
async function buildAudioFilters(sourcePath, isLoop) {
  if (!isLoop) {
    return [
      `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD}`,
      `loudnorm=I=${LOUDNESS.I}:LRA=${LOUDNESS.LRA}:tp=${LOUDNESS.TP}`,
    ].join(',');
  }

  // silenceremove срезает голову, из-за чего стык петли перестаёт совпадать
  // по амплитуде, — для зацикленных звуков он не применяется
  const measured = await measureLoudness(sourcePath);

  return [
    `loudnorm=I=${LOUDNESS.I}:LRA=${LOUDNESS.LRA}:tp=${LOUDNESS.TP}`,
    `measured_I=${measured.input_i}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_TP=${measured.input_tp}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
  ].join(':');
}

// главная функция обработки
async function main() {
  console.log('--- Starting Audio Processing ---');

  // проверка окружения
  if (!(await isFfmpegInstalled())) {
    console.error('Error: ffmpeg is not installed.');
    process.exit(1);
  }

  try {
    await fs.access(sourceDir);
  } catch (error) {
    console.error(`Error: Source directory '${sourceDir}' not found.`);
    process.exit(1);
  }

  await fs.mkdir(outputDir, { recursive: true });
  console.log(`> Output directory: ${outputDir}`);

  // поиск и фильтрация файлов
  const sourceFiles = await fs.readdir(sourceDir);

  // loop-файл опознаётся по имени, и молчаливое расхождение с конфигом дало бы
  // зацикленному звуку цепочку фильтров для одноразовых — со рваным стыком
  const sourceNames = new Set(
    sourceFiles.map(file => path.basename(file, path.extname(file))),
  );

  LOOP_FILES.forEach(file => {
    if (!sourceNames.has(file)) {
      console.warn(`⚠️  Loop sound "${file}" has no source in ${sourceDir}`);
    }
  });

  let hasFailures = false;

  // обработка файлов
  for (const file of sourceFiles) {
    const extension = path.extname(file).toLowerCase();

    if (!AUDIO_EXTENSIONS.includes(extension)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, file);
    const fileNameWithoutExt = path.basename(file, extension);
    const outputMp3 = path.join(outputDir, `${fileNameWithoutExt}.mp3`);
    const outputWebm = path.join(outputDir, `${fileNameWithoutExt}.webm`);

    const isLoop = LOOP_FILES.has(fileNameWithoutExt);

    console.log(`\n▶️  Processing: ${file}${isLoop ? ' (loop)' : ''}`);

    try {
      // сборка цепочки аудиофильтров
      const audioFilters = await buildAudioFilters(sourcePath, isLoop);

      const command = [
        'ffmpeg',
        '-nostdin', // запретить ввод с клавиатуры
        `-i "${sourcePath}"`, // входной файл
        '-hide_banner -loglevel error -y', // меньше вывода в консоль
        // -af — опция выхода и действует только на следующий за ней файл,
        // поэтому цепочка фильтров указывается для каждого выхода отдельно
        // MP3
        `-af "${audioFilters}"`,
        `-c:a libmp3lame -q:a ${CODEC_SETTINGS.MP3_QUALITY} "${outputMp3}"`,
        // WebM (application=audio: libopus иначе оптимизирует под речь)
        `-af "${audioFilters}"`,
        `-c:a libopus -application audio -b:a ${CODEC_SETTINGS.WEBM_BITRATE} "${outputWebm}"`,
      ].join(' ');

      await execPromise(command);
      console.log(`✅  Done: ${outputMp3}, ${outputWebm}`);
    } catch (error) {
      hasFailures = true;
      console.error(`❌  Error processing: ${file}`);
      console.error(error.stderr || error.message);
    }
  }

  // npm run build — это `audio:process && vite build`: без ненулевого кода
  // сборка уедет дальше с недостающими звуками
  if (hasFailures) {
    console.error('\n💥 Some files failed to process.');
    process.exitCode = 1;

    return;
  }

  console.log('\n🎉 All files processed successfully!');
}

main().catch(err => {
  console.error('\nCritical script error:', err);
  process.exit(1);
});
