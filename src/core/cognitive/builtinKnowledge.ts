export interface BuiltinKnowledgeEntry {
  id: string;
  title: string;
  patterns: RegExp[];
  english: string;
  hinglish: string;
  tags: string[];
}

const BUILTIN_KNOWLEDGE_ENTRIES: BuiltinKnowledgeEntry[] = [
  {
    id: 'kb-ram',
    title: 'RAM (Random Access Memory)',
    patterns: [/\bram\b/i, /\brandom\s+access\s+memory\b/i],
    english:
      'RAM (Random Access Memory) is high-speed temporary working memory used by your CPU to hold running apps, open tabs, and active data. Unlike an SSD or hard drive, RAM clears when power is turned off.',
    hinglish:
      'RAM (Random Access Memory) computer ki fast temporary memory hoti hai jahan abhi chal rahe apps, browser tabs aur active data store hote hain. SSD ya hard drive ke comparison mein RAM bahut tez hoti hai, aur laptop band hone par clear ho jaati hai.',
    tags: ['hardware', 'ram', 'memory', 'computer'],
  },
  {
    id: 'kb-cpu',
    title: 'CPU (Central Processing Unit)',
    patterns: [/\bcpu\b/i, /\bprocessor\b/i, /\bcentral\s+processing\s+unit\b/i],
    english:
      'The CPU (Central Processing Unit) is the primary processor that executes program instructions, handles arithmetic and logic operations, and coordinates hardware across your system.',
    hinglish:
      'CPU (Central Processing Unit) computer ka main dimag ya processor hota hai jo saare programs ki instructions execute karta hai, calculations karta hai, aur poore system ke kaam coordinate karta hai.',
    tags: ['hardware', 'cpu', 'processor'],
  },
  {
    id: 'kb-gpu',
    title: 'GPU (Graphics Processing Unit)',
    patterns: [/\bgpu\b/i, /\bgraphics\s+card\b/i, /\bgraphics\s+processing\s+unit\b/i],
    english:
      'A GPU (Graphics Processing Unit) is a specialized parallel processor designed to render 2D/3D graphics, video, and run parallel workloads such as machine learning.',
    hinglish:
      'GPU (Graphics Processing Unit) ek parallel processor hai jo graphics, gaming, video rendering aur AI/machine learning jaise parallel tasks ko tez chalane ke liye use hota hai.',
    tags: ['hardware', 'gpu', 'graphics'],
  },
  {
    id: 'kb-ssd',
    title: 'SSD vs HDD Storage',
    patterns: [/\bssd\b/i, /\bsolid\s+state\s+drive\b/i, /\bhdd\b/i, /\bhard\s+drive\b/i],
    english:
      'An SSD (Solid State Drive) stores files permanently on flash memory chips with no moving parts, making boot times and file reads much faster than a spinning mechanical HDD (Hard Disk Drive).',
    hinglish:
      'SSD (Solid State Drive) permanent storage ke liye flash memory chips use karta hai jisme koi moving part nahi hota, isliye yeh purani mechanical hard drive (HDD) se kaafi fast boot aur file loading deta hai.',
    tags: ['hardware', 'ssd', 'storage'],
  },
  {
    id: 'kb-python',
    title: 'Python Programming Language',
    patterns: [/\bpython\b/i],
    english:
      'Python is a high-level, readable programming language widely used for automation scripts, web backends, data analysis, and AI/ML. It uses clean indentation, dynamic typing, and a rich standard library plus packages like NumPy, Pandas, and FastAPI.',
    hinglish:
      'Python ek easy-to-read high-level programming language hai jo automation scripts, web development, data science aur AI ke liye bahut popular hai. Isme clean indentation syntax milta hai aur variables ka type automatically handle hota hai.',
    tags: ['programming', 'python', 'coding'],
  },
  {
    id: 'kb-c-lang',
    title: 'C Programming Language',
    patterns: [/\bc\s+programming\b/i, /\bc\s+language\b/i, /\bwhat\s+is\s+c\b/i, /\bc\s+kya\s+hai\b/i, /\bc\s+samjh/i],
    english:
      'C is a fast, compiled procedural programming language created by Dennis Ritchie. It gives direct control over memory via pointers and powers operating systems, embedded firmware, and system utilities.',
    hinglish:
      'C ek fast compiled programming language hai jo low-level memory control (pointers) aur high performance deti hai. Operating systems, compilers aur embedded systems aksar C mein likhe jaate hain.',
    tags: ['programming', 'c', 'coding'],
  },
  {
    id: 'kb-cpp',
    title: 'C++ Programming Language',
    patterns: [/\bc\+\+\b/i, /\bcpp\b/i],
    english:
      'C++ extends the C language with object-oriented classes, templates, RAII memory management, and the Standard Template Library (STL), making it ideal for game engines, browsers, and high-performance systems.',
    hinglish:
      'C++ C language ka extension hai jisme classes/OOP, templates aur STL milte hain. High-performance software, game engines aur desktop engines banane ke liye C++ use hota hai.',
    tags: ['programming', 'cpp', 'coding'],
  },
  {
    id: 'kb-javascript',
    title: 'JavaScript',
    patterns: [/\bjavascript\b/i, /\bjs\b/i],
    english:
      'JavaScript is the scripting language of the web that runs in browsers and server runtimes like Node.js to build interactive interfaces, APIs, and desktop apps.',
    hinglish:
      'JavaScript web ki core language hai jo browsers aur Node.js server runtime mein chalti hai — interactive websites, APIs aur apps banane ke liye use hoti hai.',
    tags: ['programming', 'javascript', 'web'],
  },
  {
    id: 'kb-typescript',
    title: 'TypeScript',
    patterns: [/\btypescript\b/i],
    english:
      'TypeScript is a statically typed superset of JavaScript that catches type mismatches at compile time and improves editor autocomplete before compiling down to standard JavaScript.',
    hinglish:
      'TypeScript JavaScript ke upar static types add karta hai taaki coding time par hi type errors pakde ja sakein, aur compile hokar normal JavaScript ban jaata hai.',
    tags: ['programming', 'typescript', 'web'],
  },
  {
    id: 'kb-html-css',
    title: 'HTML & CSS',
    patterns: [/\bhtml\b/i, /\bcss\b/i],
    english:
      'HTML (HyperText Markup Language) defines the structure and elements of a web page, while CSS (Cascading Style Sheets) controls layout, colors, typography, and responsive styling.',
    hinglish:
      'HTML web page ka structure aur content banata hai (headings, buttons, forms), aur CSS uska design, colors, layout aur responsive look control karta hai.',
    tags: ['web', 'html', 'css'],
  },
  {
    id: 'kb-sql',
    title: 'SQL & SQLite',
    patterns: [/\bsql\b/i, /\bsqlite\b/i, /\bdatabase\b/i],
    english:
      'SQL (Structured Query Language) manages and queries relational tables. SQLite is a serverless embedded SQL database that stores an entire database in a single local file.',
    hinglish:
      'SQL relational tables mein data store aur query karne ki language hai. SQLite ek lightweight local database engine hai jo bina alag server ke ek single file mein data save karta hai.',
    tags: ['database', 'sql', 'sqlite'],
  },
  {
    id: 'kb-ai-ml',
    title: 'Artificial Intelligence & Machine Learning',
    patterns: [/\bartificial\s+intelligence\b/i, /\bmachine\s+learning\b/i, /\bwhat\s+is\s+ai\b/i, /\bai\s+kya\s+hai\b/i],
    english:
      'Artificial Intelligence (AI) builds systems that perform tasks requiring human-like reasoning, language understanding, or perception. Machine Learning (ML) is a subset where models learn patterns from data instead of hard-coded rules.',
    hinglish:
      'Artificial Intelligence (AI) aise systems banata hai jo language samajhne, decision lene ya pattern pehchanne jaise kaam kar sakein. Machine Learning AI ka hissa hai jisme system data se khud patterns seekhta hai.',
    tags: ['ai', 'ml', 'concepts'],
  },
  {
    id: 'kb-os',
    title: 'Operating System (OS)',
    patterns: [/\boperating\s+system\b/i, /\bwhat\s+is\s+os\b/i, /\bos\s+kya\s+hai\b/i],
    english:
      'An Operating System (like Windows, Linux, or macOS) manages hardware resources—CPU scheduling, RAM allocation, storage filesystems, and device drivers—and provides the interface for applications.',
    hinglish:
      'Operating System (jaise Windows, Linux ya macOS) hardware aur apps ke beech bridge hota hai — yeh CPU, RAM, files aur devices ko manage karta hai.',
    tags: ['os', 'windows', 'linux'],
  },
  {
    id: 'kb-api',
    title: 'API (Application Programming Interface)',
    patterns: [/\bapi\b/i, /\brest\s+api\b/i],
    english:
      'An API (Application Programming Interface) is a defined contract of endpoints or functions that lets two software components exchange requests and structured data reliably.',
    hinglish:
      'API ek set of rules aur endpoints hota hai jiske through do software programs ya frontend aur backend aapas mein data aur commands exchange karte hain.',
    tags: ['software', 'api', 'backend'],
  },
];

function isKnowledgeSeekingPhrase(lower: string): boolean {
  const isExplicitExplain =
    /\b(what\s+is|what\s+are|who\s+is|define|explain|meaning\s+of|difference\s+between|tell\s+me\s+about|samjhao|samjha|batao|bata\s+do|kya\s+hai|kya\s+hota\s+hai|ka\s+matlab)\b/i.test(
      lower
    );
  if (isExplicitExplain) return true;

  // Reject action commands that mention tech nouns (e.g. "check my laptop performance", "open notepad and write a program")
  if (
    /\b(open|launch|start|kholo|chalu|search\s+for|search\s+google|search\s+online|play|create|make|banao|write|likho|delete|check\s+(?:my\s+)?(?:laptop|system|performance|cpu|ram))\b/i.test(
      lower
    )
  ) {
    return false;
  }

  // Short bare noun + "?" (e.g. "RAM?" or "Python?")
  return lower.endsWith('?') && lower.split(/\s+/).length <= 5;
}

export function lookupBuiltinKnowledge(
  query: string,
  preferHinglish = false
): { id: string; title: string; summary: string; tags: string[] } | null {
  const clean = query.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  if (!isKnowledgeSeekingPhrase(lower)) return null;

  const isHinglish =
    preferHinglish ||
    /\b(mujhe|samjhao|samjha|kya\s+hai|kya\s+hota|batao|hindi|hinglish)\b/i.test(lower);

  for (const entry of BUILTIN_KNOWLEDGE_ENTRIES) {
    if (entry.patterns.some((rx) => rx.test(clean))) {
      return {
        id: entry.id,
        title: entry.title,
        summary: isHinglish ? entry.hinglish : entry.english,
        tags: entry.tags,
      };
    }
  }
  return null;
}

export function listBuiltinKnowledgeEntries(): BuiltinKnowledgeEntry[] {
  return BUILTIN_KNOWLEDGE_ENTRIES;
}
