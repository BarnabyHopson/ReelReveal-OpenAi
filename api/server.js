const express = require('express');
const cors = require('cors');
const path = require('path');

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api', (req, res) => {
  res.json({ message: 'ReelReveal API is running!' });
});

// TMDB search
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    if (!query) return res.status(400).json({ error: 'Search query is required' });

    const tmdbResponse = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`
    );
    if (!tmdbResponse.ok) throw new Error('Failed to search TMDB');

    const tmdbData = await tmdbResponse.json();
    if (!tmdbData.results?.length) return res.status(404).json({ error: 'No films found' });

    const film = tmdbData.results[0];

    const detailsResponse = await fetch(
      `https://api.themoviedb.org/3/movie/${film.id}?api_key=${process.env.TMDB_API_KEY}&append_to_response=credits`
    );
    if (!detailsResponse.ok) throw new Error('Failed to fetch film details');

    const detailsData = await detailsResponse.json();
    res.json(detailsData);
  } catch (err) {
    console.error('Error searching film:', err);
    res.status(500).json({ error: 'Failed to search for film', message: err.message });
  }
});

// Insights via OpenAI
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

    // Optional: enable if you want web search (requires feature flag on your account)
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

module.exports = app; // CommonJS export for Vercel serverless
