"""
Flask API for the Derivative of Graphs visualizer.
Designed as a Vercel serverless function entry-point.

Endpoints:
    POST /api/init-random   - Generate a random temporal graph
    POST /api/differential  - Compute the graph differential
    POST /api/analyze       - Run analysis (eternal twins, max degree)
"""

import os
import sys

# Allow importing the backend package from the project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, request, jsonify, send_from_directory
from backend.graph_logic import TemporalGraph

app = Flask(__name__, static_folder="../public", static_url_path="/")


# ---------- static serving (local dev) ----------

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(app.static_folder, path)


# ---------- API endpoints ----------

@app.route("/api/init-random", methods=["POST"])
def init_random():
    """Generate a random temporal graph and return it."""
    data = request.get_json(silent=True) or {}
    num_nodes = min(int(data.get("num_nodes", 10)), 30)
    num_snapshots = min(int(data.get("num_snapshots", 5)), 20)
    edge_prob = float(data.get("edge_prob", 0.2))
    edge_prob = max(0.0, min(edge_prob, 1.0))

    graph = TemporalGraph.generate_random(num_nodes, num_snapshots, edge_prob)
    return jsonify({"status": "ok", "graph": graph.to_dict()})


@app.route("/api/differential", methods=["POST"])
def differential():
    """Compute the differential G_->^{t, delta}.

    Expects JSON body:
        { "graph": {...}, "t": int, "delta": int }

    The graph field carries the full temporal-graph object so the
    endpoint works correctly in a stateless serverless environment.
    """
    data = request.get_json()
    if not data or "graph" not in data:
        return jsonify({"error": "Request must include 'graph' data."}), 400

    graph = TemporalGraph.from_dict(data["graph"])
    t = int(data.get("t", 0))
    delta = int(data.get("delta", 2))

    try:
        diff = graph.compute_differential(t, delta)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    # ---- Format for Cytoscape.js ----
    cy_nodes = []
    for node_id, time in diff["nodes"]:
        cy_nodes.append({
            "data": {
                "id": f"{node_id}_t{time}",
                "label": f"v{node_id}",
                "vertex": node_id,
                "time": time,
            }
        })

    cy_edges = []
    for i, (src, tgt) in enumerate(diff["black_edges"]):
        cy_edges.append({
            "data": {
                "id": f"b_{i}",
                "source": f"{src[0]}_t{src[1]}",
                "target": f"{tgt[0]}_t{tgt[1]}",
                "type": "black",
            }
        })
    for i, (src, tgt) in enumerate(diff["red_edges"]):
        cy_edges.append({
            "data": {
                "id": f"r_{i}",
                "source": f"{src[0]}_t{src[1]}",
                "target": f"{tgt[0]}_t{tgt[1]}",
                "type": "red",
            }
        })

    return jsonify({
        "nodes": cy_nodes,
        "edges": cy_edges,
        "stats": {
            "num_nodes": len(cy_nodes),
            "num_black_edges": len(diff["black_edges"]),
            "num_red_edges": len(diff["red_edges"]),
        },
    })


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """Return analysis results: eternal twins, max degree, tree-width."""
    data = request.get_json()
    if not data or "graph" not in data:
        return jsonify({"error": "Request must include 'graph' data."}), 400

    graph = TemporalGraph.from_dict(data["graph"])
    t = int(data.get("t", 0))
    delta = int(data.get("delta", 2))

    twins = graph.find_eternal_twins()

    max_deg = None
    tw_current = None
    try:
        max_deg = graph.max_degree_differential(t, delta)
        tw_current = graph.tree_width_of_differential(t, delta)
    except ValueError:
        pass

    # Compute Delta-differential tree-width dtw_Delta(G)
    dtw_result = None
    try:
        dtw_result = graph.differential_tree_width(delta)
    except ValueError:
        pass

    return jsonify({
        "eternal_twins": [{"u": u, "v": v} for u, v in twins],
        "num_eternal_twins": len(twins),
        "max_degree_differential": max_deg,
        "tw_current_differential": tw_current,
        "dtw_delta": dtw_result["dtw"] if dtw_result else None,
        "dtw_per_t": dtw_result["per_t"] if dtw_result else [],
        "lifetime": graph.lifetime,
        "num_vertices": len(graph.vertices),
        "edge_counts_per_snapshot": graph.snapshot_edge_counts(),
        "union_graph_edge_count": len(graph.union_graph_edges()),
    })


@app.route("/api/static-expansion", methods=["POST"])
def static_expansion():
    """Compute the full static expansion graph G_-> over all snapshots."""
    data = request.get_json()
    if not data or "graph" not in data:
        return jsonify({"error": "Request must include 'graph' data."}), 400

    graph = TemporalGraph.from_dict(data["graph"])

    try:
        diff = graph.compute_static_expansion()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    cy_nodes = []
    for node_id, time in diff["nodes"]:
        cy_nodes.append({
            "data": {
                "id": f"{node_id}_t{time}",
                "label": f"v{node_id}",
                "vertex": node_id,
                "time": time,
            }
        })

    cy_edges = []
    for i, (src, tgt) in enumerate(diff["black_edges"]):
        cy_edges.append({
            "data": {
                "id": f"b_{i}",
                "source": f"{src[0]}_t{src[1]}",
                "target": f"{tgt[0]}_t{tgt[1]}",
                "type": "black",
            }
        })
    for i, (src, tgt) in enumerate(diff["red_edges"]):
        cy_edges.append({
            "data": {
                "id": f"r_{i}",
                "source": f"{src[0]}_t{src[1]}",
                "target": f"{tgt[0]}_t{tgt[1]}",
                "type": "red",
            }
        })

    return jsonify({
        "nodes": cy_nodes,
        "edges": cy_edges,
        "stats": {
            "num_nodes": len(cy_nodes),
            "num_black_edges": len(diff["black_edges"]),
            "num_red_edges": len(diff["red_edges"]),
        },
    })


# ---------- local dev server ----------

if __name__ == "__main__":
    app.run(debug=True, port=5000)
