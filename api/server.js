const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from root
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'ReelReveal API is running!' });
});

// Search films endpoint
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // Search TMDB for the film
    const tmdbResponse = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(query)}`
    );
    
    if (!tmdbResponse.ok) {
      throw new Error('Failed to search for film');
    }
    
    const tmdbData = await tmdbResponse.json();
    
    if (tmdbData.results.length === 0) {
      return res.status(404).json({ error: 'No films found' });
    }

    const film = tmdbData.results[0];
    
    // Get detailed film info including credits
    const detailsResponse = await fetch(
      `https://api.themoviedb.org/3/movie/${film.id}?api_key=${process.env.TMDB_API_KEY}&append_to_response=credits`
    );
    
    const detailsData = await detailsResponse.json();
    
    res.json(detailsData);
    
  } catch (error) {
    console.error('Error searching film:', error);
    res.status(500).json({ 
      error: 'Failed to search for film',
      message: error.message 
    });
  }
});

// Generate film insights endpoint
app.post('/api/generate-insights', async (req, res) => {
  try {
    const { title, year, director, mainCast, overview, budget, revenue, runtime, type } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Film title is required' });
    }

    let prompt;
    let maxTokens;

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

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status, response.statusText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const claudeResponse = data.content[0].text;
    
    // Format the response for consistent display
    const sentences = claudeResponse.split('. ').map(sentence => 
      sentence.endsWith('.') ? sentence : sentence + '.'
    );
    
    const formattedInsights = sentences.join('\n\n');
    
    res.json({ 
      insights: formattedInsights,
      success: true 
    });

  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ 
      error: 'Failed to generate insights',
      message: error.message 
    });
  }
});

// Serve the main HTML file for any non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});