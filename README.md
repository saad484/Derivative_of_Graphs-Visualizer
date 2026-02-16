# Derivative of Graphs - Visualizer

An interactive web-based tool for visualizing and analyzing temporal graphs based on the mathematical framework of the **differential operator** from the paper *"Derivative of Graphs"* by Bui-Xuan, Krasnopol, Monasson & Sznajder.

## Features

- **Generate Temporal Graphs** with configurable vertices, snapshots, and edge probability
- **Visualize** all snapshots, static expansion graphs, and differential operator graphs
- **Compute Differentials** — analyze graph dynamics through the differential operator G→^{t,Δ}
- **Advanced Analysis** — eternal twins detection, max degree, tree-width, and Δ-differential tree-width
- **Import/Export** custom temporal graphs via JSON

## Tech Stack

**Backend:** Python, Flask, NetworkX
**Frontend:** HTML/CSS/JS, Cytoscape.js
**Deployment:** Vercel (serverless)

## Getting Started

### Prerequisites

- Python 3.8+

### Installation

```bash
# Clone the repository
git clone https://github.com/saad484/Derivative_of_Graphs-Visualizer.git
cd Derivative_of_Graphs-Visualizer

# Install dependencies
pip install -r requirements.txt

# Run the server
python api/index.py
```

Then open `public/index.html` in your browser, or visit the deployed version on Vercel.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/init-random` | Generate a random temporal graph |
| POST | `/api/differential` | Compute differential G→^{t,Δ} |
| POST | `/api/analyze` | Get analysis (eternal twins, max degree, tree-width) |
| POST | `/api/static-expansion` | Compute full static expansion G→ |

## Project Structure

```
├── api/
│   └── index.py            # Flask API endpoints
├── backend/
│   └── graph_logic.py      # Temporal graph & differential operator logic
├── public/
│   ├── index.html           # Main UI
│   └── script.js            # Frontend (Cytoscape.js visualization)
├── requirements.txt
└── vercel.json              # Deployment config
```
