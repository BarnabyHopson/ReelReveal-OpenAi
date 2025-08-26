const express = require('express');
const cors = require('cors');

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api', (req, res) => {
  res.json({ message: 'ReelReveal API is running!' });
});

// TMDB search (with clear diagnostics)
app.get('/api/search/:query', async (req, res) => {
  try {
    const TMDB_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_KEY) {
      console.error('TMDB_API_KEY missing');
      return res.status(500).json({ error: 'Server misconfigured: TMDB_API_KEY missing' });
    }

    const query = req.params.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
    const tmdbResponse = await fetch(searchUrl);

    if (!tmdbResponse.ok) {
      const body = await tmdbResponse.text().catch(() => '');
      console.error('TMDB search error:', tmdbResponse.status, body);
      return res.status(502).json({
        error: 'TMDB search failed',
        status: tmdbResponse.status,
        details: body || 'No response body'
      });
    }

    const tmdbData = await tmdbResponse.json();
    if (!tmdbData.results?.length) {
      return res.status(404).json({ error: 'No films found' });
    }

    const film = tmdbData.results[0];
    const detailsUrl = `https://api.themoviedb.org/3/movie/${film.id}?api_key=${TMDB_KEY}&append_to_response=credits`;
    const detailsResponse = await fetch(detailsUrl);

    if (!detailsResponse.ok) {
      const body = await detailsResponse.text().catch(() => '');
      console.error('TMDB details error:', detailsResponse.status, body);
      return res.status(502).json({
        error: 'TMDB details failed',
        status: detailsResponse.status,
        details: body || 'No response body'
      });
    }

    const detailsData = await detailsResponse.json();
    return res.json(detailsData);
  } catch (err) {
    console.error('Error searching film:', err);
    return res.status(500).json({ error: 'Failed to search for film', message: err.message });
  }
});

// Insights via OpenAI (serverless-safe: no app.listen, we export app)
app.post('/api/generate-insights', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY in server config' });
    }

    const { title, year, director, mainCast, overview, budget, revenue, runtime, type } = req.body;
    if (!title) return res.status(400).json({ error: 'Film title is required' });

    let prompt, maxTokens;
    if (type === 'extended') {
      prompt = `Provide additional detailed insights about "${title}" (${year}). Focus on:

- Behind-the-scenes stories and trivia
- Production challenges
- Casting decisions or actor prep
- Technical innovations
- Cultural impact
- Box office context
- Critical reception and awards

Film context:
Director: ${director}
Cast: ${mainCast?.join(', ') || 'Unknown'}
Budget: $${budget?.toLocaleString() || 'Unknown'}
Revenue: $${revenue?.toLocaleString() || 'Unknown'}`;
      maxTokens = 400;
    } else {
      prompt = `Generate engaging fun facts and insights about the film "${title}" (${year}).

Film details:
Director: ${director}
Cast: ${mainCast?.join(', ') || 'Unknown'}
Plot: ${overview}
Budget: $${budget?.toLocaleString() || 'Unknown'}
Revenue: $${revenue?.toLocaleString() || 'Unknown'}
Runtime: ${runtime} minutes

Provide a short summary covering trivia, challenges, cast/crew details, reception, or innovations.`;
      maxTokens = 300;
    }

    const request = {
      model: 'gpt-4o-mini',
      input: prompt,
      max_output_tokens: maxTokens
    };

    // Optional: enable web search if available on your account
    // if (process.env.USE_WEB_SEARCH === 'true') {
    //   request.tools = [{ type: 'web_search_preview' }];
    // }

    const ai = await openai.responses.create(request);
    const text = ai.output_text || '';

    const sentences = text.split('. ').map(s => (s.endsWith('.') ? s : s + '.'));
    const formattedInsights = sentences.join('\n\n');

    res.json({ insights: formattedInsights, success: true });
  } catch (err) {
    console.error('Error generating insights:', err);
    res.status(500).json({ error: 'Failed to generate insights', message: err.message });
  }
});

// Export the Express app for Vercel serverless
module.exports = app;
