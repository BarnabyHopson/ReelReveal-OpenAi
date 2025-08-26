const express = require('express');
const cors = require('cors');
const path = require('path');

const OpenAI = require('openai'); // NEW
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // NEW

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from repo root
app.use(express.static(path.join(__dirname, '..')));

app.get('/api', (req, res) => {
  res.json({ message: 'ReelReveal API is running!' });
});

// Search films (unchanged; uses TMDB)
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    const tmdbResponse = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`
    );
    if (!tmdbResponse.ok) throw new Error('Failed to search for film');

    const tmdbData = await tmdbResponse.json();
    if (!tmdbData.results?.length) return res.status(404).json({ error: 'No films found' });

    const film = tmdbData.results[0];

    const detailsResponse = await fetch(
      `https://api.themoviedb.org/3/movie/${film.id}?api_key=${process.env.TMDB_API_KEY}&append_to_response=credits`
    );
    if (!detailsResponse.ok) throw new Error('Failed to fetch film details');

    const detailsData = await detailsResponse.json();
    res.json(detailsData);
  } catch (error) {
    console.error('Error searching film:', error);
    res.status(500).json({ error: 'Failed to search for film', message: error.message });
  }
});

// Generate insights (SWITCHED to OpenAI)
app.post('/api/generate-insights', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY');
      return res.status(500).json({ error: 'Server not configured: OPENAI_API_KEY missing' });
    }

    const { title, year, director, mainCast, overview, budget, revenue, runtime, type } = req.body;
    if (!title) return res.status(400).json({ error: 'Film title is required' });

    let prompt, maxTokens;
    if (type === 'extended') {
      prompt = `Provide additional detailed insights about "${title}" (${year}). Focus on:

- More behind-the-scenes stories and trivia
- Detailed production challenges and how they were overcome
- Interesting casting decisions or actor preparations
- Technical innovations or cinematography details
- Cultural impact or influence on later films
- Box office performance context
- Critical reception and awards details

Film context:
- Director: ${director}
- Cast: ${mainCast?.join(', ') || 'Unknown'}
- Budget: $${budget?.toLocaleString() || 'Unknown'}
- Revenue: $${revenue?.toLocaleString() || 'Unknown'}

Provide 4-5 additional insights as separate, well-spaced sentences. Format each insight as a separate paragraph.`;
      maxTokens = 400;
    } else {
      prompt = `Generate engaging fun facts and insights about the film "${title}" (${year}). 

Film details:
- Director: ${director}
- Main cast: ${mainCast?.join(', ') || 'Unknown'}
- Plot: ${overview}
- Budget: $${budget?.toLocaleString() || 'Unknown'}
- Revenue: $${revenue?.toLocaleString() || 'Unknown'}
- Runtime: ${runtime} minutes

Please provide a brief summary (3-4 sentences) covering:
- Behind-the-scenes trivia
- Production challenges or innovations
- Interesting cast/crew details
- Awards or critical reception
- Anything revolutionary or unusual about the production

Format as separate, spaced sentences. If possible, mention the director and 1-2 other notable films they're known for, plus any Oscar wins, but don't force it if not relevant.`;
      maxTokens = 300;
    }

    // If you want to test first, keep this simple (no web search):
    const request = {
      model: 'gpt-4o-mini',
      input: prompt,
      max_output_tokens: maxTokens
    };

    // OPTIONAL: enable web search once basics work (requires access on your account)
    // if (String(process.env.USE_WEB_SEARCH || '').toLowerCase() === 'true') {
    //   request.tools = [{ type: 'web_search_preview' }]; // or { type: 'web_search' } depending on access
    // }

    let ai;
    try {
      ai = await openai.responses.create(request);
    } catch (apiErr) {
      const status = apiErr.status || apiErr.response?.status;
      const data = apiErr.response?.data || apiErr.message || apiErr;
      console.error('OpenAI error:', status, data);
      return res.status(500).json({
        error: 'OpenAI request failed',
        details: typeof data === 'string' ? data : (data?.error?.message || JSON.stringify(data))
      });
    }

    const text = ai.output_text || '';
    // Keep your paragraph style
    const sentences = text.split('. ').map(s => (s.endsWith('.') ? s : s + '.'));
    const formattedInsights = sentences.join('\n\n');

    return res.json({ insights: formattedInsights, success: true });
  } catch (error) {
    console.error('Error generating insights:', error);
    return res.status(500).json({ error: 'Failed to generate insights', message: error.message });
  }
});

// Serve the SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
