"""
Domain logic for the "Derivative of Graphs" framework.
Implements the temporal graph model and differential operator
as defined in Bui-Xuan et al. (2026).

Key definitions from the paper:
- Temporal Graph: G = (V, E_0, ..., E_{tau-1}), a sequence of edge sets
  over the same vertex set V.
- Static Expansion Graph (G->): Vertices are (v, t) for all v in V
  and 0 <= t < tau. Black edges connect (u,t)-(v,t) when uv in E_t.
  Red edges connect (v,t)-(v,t+1) for temporal continuity.
- Differential G_->^{t,Delta}: The static expansion of the sub-temporal
  graph from snapshot t to snapshot t+Delta-1.
- Eternal Twins: vertices u != v with identical open neighborhoods
  N_t(u) = N_t(v) in every snapshot (per the paper's phi_twins formula).
"""

import networkx as nx
import random
from itertools import combinations


class TemporalGraph:
    """A temporal graph storing a sequence of snapshot edge-sets over a
    fixed vertex set V."""

    def __init__(self, vertices=None, snapshots=None):
        """
        Args:
            vertices: list of vertex ids (e.g. [0, 1, ..., n-1])
            snapshots: list of edge-lists, one per time step.
                       Each edge-list contains (u, v) tuples.
        """
        self.vertices = vertices or []
        self.snapshots = snapshots or []

    @property
    def lifetime(self):
        """tau: number of snapshots."""
        return len(self.snapshots)

    def get_snapshot_graph(self, t):
        """Return snapshot G_t as a networkx Graph."""
        G = nx.Graph()
        G.add_nodes_from(self.vertices)
        if 0 <= t < self.lifetime:
            G.add_edges_from(self.snapshots[t])
        return G

    # ------------------------------------------------------------------
    # Differential Operator  (Definition 1 from the paper)
    # ------------------------------------------------------------------

    def compute_differential(self, t, delta):
        """Compute the differential G_->^{t, Delta}.

        This constructs the static expansion graph for the sub-temporal
        graph G^{t,Delta} = (G_x)_{t <= x <= t+Delta-1}.

        Vertices: (node_id, time) for each node_id in V and
                  t <= time <= t + Delta - 1
        Black Edges: (u, time) -- (v, time)  if uv in E_{time}
        Red Edges:   (v, time) -> (v, time+1) for temporal continuity

        Returns:
            dict with keys 'nodes', 'black_edges', 'red_edges'
        """
        if t < 0 or delta < 1 or t + delta - 1 >= self.lifetime:
            raise ValueError(
                f"Invalid window: t={t}, delta={delta}, "
                f"lifetime={self.lifetime}. Need 0 <= t and "
                f"t + delta - 1 < lifetime."
            )

        nodes = []
        black_edges = []
        red_edges = []

        for time in range(t, t + delta):
            # Time-vertices for this snapshot
            for v in self.vertices:
                nodes.append((v, time))

            # Black edges: within-snapshot adjacency
            G_t = self.get_snapshot_graph(time)
            for u, v in G_t.edges():
                black_edges.append(((u, time), (v, time)))

            # Red edges: temporal continuity to next time step
            if time < t + delta - 1:
                for v in self.vertices:
                    red_edges.append(((v, time), (v, time + 1)))

        return {
            "nodes": nodes,
            "black_edges": black_edges,
            "red_edges": red_edges,
        }

    # ------------------------------------------------------------------
    # Eternal Twins
    # ------------------------------------------------------------------

    def find_eternal_twins(self):
        """Find all pairs (u, v) that are eternal twins.

        Two vertices u != v are eternal twins if they have the same
        (static) open neighbourhood N_t(u) = N_t(v) at every snapshot
        G_t.  (See page 9 of the paper, formula phi_twins.)

        Note: since graphs are simple (no self-loops), v in N_t(u) but
        v not in N_t(v) whenever uv in E_t.  Therefore vertices that
        are adjacent at ANY snapshot can never be eternal twins.

        Returns:
            list of (u, v) tuples
        """
        twins = []
        for u, v in combinations(self.vertices, 2):
            is_twin = True
            for t in range(self.lifetime):
                G_t = self.get_snapshot_graph(t)
                nu = set(G_t.neighbors(u))
                nv = set(G_t.neighbors(v))
                if nu != nv:
                    is_twin = False
                    break
            if is_twin:
                twins.append((u, v))
        return twins

    # ------------------------------------------------------------------
    # Analysis helpers
    # ------------------------------------------------------------------

    def _differential_as_nx(self, t, delta):
        """Build the differential as a plain networkx Graph (both
        black and red edges are undirected).  This is the static
        expansion graph G_->^{t, Delta} used when computing
        tree-width."""
        diff = self.compute_differential(t, delta)
        G = nx.Graph()
        G.add_nodes_from(diff["nodes"])
        G.add_edges_from(diff["black_edges"])
        G.add_edges_from(diff["red_edges"])
        return G

    def tree_width_of_differential(self, t, delta):
        """Compute the tree-width of the differential G_->^{t, Delta}.

        Uses the min-degree heuristic from networkx (upper bound that
        is exact for many practical instances).

        Returns:
            int  -- tree-width of the differential
        """
        G = self._differential_as_nx(t, delta)
        tw, _ = nx.algorithms.approximation.treewidth_min_degree(G)
        return tw

    def differential_tree_width(self, delta):
        """Compute the Delta-differential tree-width dtw_Delta(G).

        Definition from the paper:
            dtw_Delta(G) = max_{0 <= t <= tau - Delta}  tw(G_->^{t, Delta})

        Returns:
            dict with 'dtw' (the max), 'per_t' (list of (t, tw) pairs)
        """
        if delta < 1 or delta > self.lifetime:
            raise ValueError(
                f"delta={delta} out of range for lifetime={self.lifetime}"
            )
        per_t = []
        for t in range(self.lifetime - delta + 1):
            tw = self.tree_width_of_differential(t, delta)
            per_t.append((t, tw))
        dtw = max(tw for _, tw in per_t) if per_t else 0
        return {"dtw": dtw, "per_t": per_t}

    def max_degree_differential(self, t, delta):
        """Return the maximum degree in the differential graph."""
        diff = self.compute_differential(t, delta)
        degree = {node: 0 for node in diff["nodes"]}
        for u, v in diff["black_edges"] + diff["red_edges"]:
            degree[u] += 1
            degree[v] += 1
        return max(degree.values()) if degree else 0

    def snapshot_edge_counts(self):
        """Return the number of edges in each snapshot."""
        return [len(edges) for edges in self.snapshots]

    def union_graph_edges(self):
        """Return the edge set of the union graph G_downarrow."""
        all_edges = set()
        for edges in self.snapshots:
            for u, v in edges:
                all_edges.add((min(u, v), max(u, v)))
        return list(all_edges)

    def compute_static_expansion(self):
        """Compute the full static expansion graph G_-> over ALL
        snapshots [0, tau-1].  This is equivalent to
        compute_differential(0, tau)."""
        return self.compute_differential(0, self.lifetime)

    # ------------------------------------------------------------------
    # Random generation
    # ------------------------------------------------------------------

    @staticmethod
    def generate_random(num_nodes=10, num_snapshots=5, edge_prob=0.2):
        """Generate a random temporal graph."""
        vertices = list(range(num_nodes))
        snapshots = []
        for _ in range(num_snapshots):
            edges = []
            for u, v in combinations(vertices, 2):
                if random.random() < edge_prob:
                    edges.append((u, v))
            snapshots.append(edges)
        return TemporalGraph(vertices=vertices, snapshots=snapshots)

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_dict(self):
        return {
            "vertices": self.vertices,
            "snapshots": [list(edges) for edges in self.snapshots],
            "lifetime": self.lifetime,
        }

    @classmethod
    def from_dict(cls, data):
        return cls(
            vertices=data["vertices"],
            snapshots=[[(e[0], e[1]) for e in edges] for edges in data["snapshots"]],
        )
