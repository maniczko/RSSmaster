from __future__ import annotations

from datetime import UTC, datetime, timedelta
import unittest

from app.workspace.service import WorkspaceService, build_ranking_states, build_story_clusters, derive_learned_interests


def make_profile(*, daily_reading_goal: int = 12) -> dict[str, object]:
    return {
        "candidate_window_hours": 72,
        "default_source_cap": 30,
        "priority_source_cap": 45,
        "emergency_source_cap": 100,
        "daily_reading_goal": daily_reading_goal,
        "interests": [],
    }


def make_row(
    *,
    item_id: str,
    title: str,
    channel_id: str = "chn_default",
    published_at: str = "2026-04-19T08:00:00Z",
    is_read: bool = False,
    is_favorite: bool = False,
    digest_candidate: bool = True,
) -> dict[str, object]:
    return {
        "id": item_id,
        "channel_id": channel_id,
        "title": title,
        "author": None,
        "source_url": f"https://example.com/{item_id}",
        "excerpt": f"Skrot dla {title}",
        "content_text": f"Pelna tresc artykulu {title} z dodatkowymi detalami i kontekstem.",
        "cleaned_html": "<p>Pelna tresc</p>",
        "published_at": published_at,
        "discovered_at": published_at,
        "ingested_at": published_at,
        "is_read": is_read,
        "is_favorite": is_favorite,
        "digest_candidate": digest_candidate,
        "channel_title": f"Zrodlo {channel_id}",
        "channel_category": "biznes",
        "channel_feed_url": f"https://example.com/{channel_id}/feed.xml",
        "channel_state": "active",
        "consecutive_failures": 0,
        "last_successful_fetch_at": published_at,
        "last_error_message": None,
        "control_tier": "default",
        "custom_source_cap": None,
        "paused_until": None,
        "snoozed_until": None,
        "group_name": None,
        "channel_items_last_24h": 4,
    }


class WorkspaceRankingTests(unittest.TestCase):
    def test_derives_learned_interests_from_positive_signals(self) -> None:
        learned = derive_learned_interests(
            [
                {
                    **make_row(
                        item_id="itm_signal",
                        title="Rzad szykuje inwestycje energetyczne na Baltyku",
                        channel_id="chn_money",
                    ),
                    "channel_title": "Money.pl",
                    "annotation_count": 1,
                    "tag_names": "energia|baltyk",
                },
                {
                    **make_row(
                        item_id="itm_signal_secondary_source",
                        title="Energetyka morska nabiera tempa w regionie",
                        channel_id="chn_pulse",
                    ),
                    "channel_title": "Pulse Energy",
                    "annotation_count": 1,
                    "tag_names": "energia|offshore",
                }
            ],
            explicit_interests=[],
        )

        learned_labels = {str(interest["normalized_topic"]) for interest in learned}
        learned_source_labels = {str(interest["label"]) for interest in learned if interest["kind"] == "source"}

        self.assertIn("energia", learned_labels)
        self.assertIn("baltyk", learned_labels)
        self.assertIn("Money.pl", learned_source_labels)

    def test_skips_source_learning_when_signals_come_from_one_source(self) -> None:
        learned = derive_learned_interests(
            [
                {
                    **make_row(
                        item_id="itm_signal_primary",
                        title="Rzad szykuje inwestycje energetyczne na Baltyku",
                        channel_id="chn_money",
                    ),
                    "channel_title": "Money.pl",
                    "annotation_count": 1,
                    "tag_names": "energia|baltyk",
                },
                {
                    **make_row(
                        item_id="itm_signal_secondary",
                        title="Port i wodór przyspieszają transformacje regionu",
                        channel_id="chn_money",
                    ),
                    "channel_title": "Money.pl",
                    "annotation_count": 0,
                    "tag_names": "energia",
                },
            ],
            explicit_interests=[],
        )

        learned_labels = {str(interest["normalized_topic"]) for interest in learned}
        self.assertIn("energia", learned_labels)
        self.assertNotIn("money.pl", learned_labels)

    def test_does_not_learn_low_signal_quote_topics_without_editorial_signal(self) -> None:
        learned = derive_learned_interests(
            [
                {
                    **make_row(
                        item_id="itm_quote_signal",
                        title="Ile kosztuje euro? Kurs euro do zlotego PLN/EUR 19.04.2026",
                        channel_id="chn_money",
                        is_favorite=True,
                    ),
                    "channel_title": "Money.pl",
                    "annotation_count": 0,
                    "tag_names": "",
                }
            ],
            explicit_interests=[],
        )

        learned_labels = {str(interest["normalized_topic"]) for interest in learned}
        self.assertNotIn("kurs", learned_labels)
        self.assertNotIn("kosztuje", learned_labels)
        self.assertNotIn("money.pl", learned_labels)

    def test_expands_candidate_window_when_recent_window_is_empty(self) -> None:
        older_published_at = (datetime.now(UTC) - timedelta(hours=96)).isoformat().replace("+00:00", "Z")
        older_row = make_row(
            item_id="itm_backlog",
            title="Wazna analiza rynku energii z backlogu",
            published_at=older_published_at,
        )

        class RepositoryStub:
            def __init__(self) -> None:
                self.window_calls: list[int] = []
                self.states: list[dict[str, object]] = []

            def list_candidate_rows(self, *, window_hours: int, limit: int) -> list[dict[str, object]]:
                self.window_calls.append(window_hours)
                if window_hours <= 72:
                    return []
                return [older_row]

            def replace_story_clusters(self, clusters: list[dict[str, object]]) -> None:
                self.clusters = clusters

            def upsert_ranking_state(self, states: list[dict[str, object]]) -> None:
                self.states = states

        repository = RepositoryStub()
        service = object.__new__(WorkspaceService)
        service.repository = repository

        service._refresh_story_clusters_and_rank(profile=make_profile(), target_count=3)

        self.assertEqual(repository.window_calls[:2], [72, 120])
        eligible = [state for state in repository.states if state["candidate_status"] == "eligible"]
        self.assertEqual(len(eligible), 1)
        self.assertEqual(eligible[0]["item_id"], "itm_backlog")

    def test_excludes_read_items_from_recommendations(self) -> None:
        rows = [
            make_row(item_id="itm_unread", title="Nowy pakiet inwestycji energetycznych"),
            make_row(item_id="itm_read", title="Przeczytany raport o rynku energii", is_read=True),
        ]

        states = build_ranking_states(rows, profile=make_profile(), clusters=build_story_clusters(rows))
        state_by_id = {state["item_id"]: state for state in states}

        self.assertEqual(state_by_id["itm_unread"]["candidate_status"], "eligible")
        self.assertEqual(state_by_id["itm_read"]["candidate_status"], "excluded")
        self.assertEqual(state_by_id["itm_read"]["candidate_reason"], "already_read")

    def test_penalizes_formulaic_quote_headlines_without_interest_match(self) -> None:
        rows = [
            make_row(
                item_id="itm_quote",
                title="Ile kosztuje euro? Kurs euro do zlotego PLN/EUR 19.04.2026",
                channel_id="chn_money",
            ),
            make_row(
                item_id="itm_story",
                title="Rzad szykuje nowy pakiet inwestycji energetycznych",
                channel_id="chn_money",
            ),
        ]

        states = build_ranking_states(rows, profile=make_profile(), clusters=build_story_clusters(rows))
        state_by_id = {state["item_id"]: state for state in states}

        self.assertLess(
            float(state_by_id["itm_quote"]["final_score"]),
            float(state_by_id["itm_story"]["final_score"]),
        )
        self.assertLess(
            float(state_by_id["itm_quote"]["score_breakdown"]["relevance_score"]),
            float(state_by_id["itm_story"]["score_breakdown"]["relevance_score"]),
        )

    def test_caps_eligible_recommendations_to_daily_goal(self) -> None:
        rows = [
            make_row(
                item_id=f"itm_{index}",
                title=f"Artykul {index}",
                channel_id=f"chn_{index}",
                published_at=f"2026-04-19T0{index}:00:00Z",
            )
            for index in range(1, 6)
        ]

        states = build_ranking_states(rows, profile=make_profile(daily_reading_goal=2), clusters=build_story_clusters(rows))

        eligible = [state for state in states if state["candidate_status"] == "eligible"]
        cutoff = [state for state in states if state["candidate_reason"] == "daily_goal_cutoff"]

        self.assertEqual(len(eligible), 2)
        self.assertEqual(len(cutoff), 3)

    def test_penalizes_repeated_low_signal_family_candidates(self) -> None:
        rows = [
            make_row(
                item_id="itm_quote_one",
                title="Ile kosztuje euro? Kurs euro do zlotego PLN/EUR 19.04.2026",
                channel_id="chn_fx_one",
            ),
            make_row(
                item_id="itm_quote_two",
                title="Ile kosztuje dolar? Kurs dolara do zlotego PLN/USD 19.04.2026",
                channel_id="chn_fx_two",
                published_at="2026-04-19T07:55:00Z",
            ),
            make_row(
                item_id="itm_story_distinct",
                title="Rzad szykuje nowy pakiet inwestycji energetycznych",
                channel_id="chn_story",
                published_at="2026-04-19T07:50:00Z",
            ),
        ]

        states = build_ranking_states(rows, profile=make_profile(), clusters=build_story_clusters(rows))
        state_by_id = {state["item_id"]: state for state in states}

        self.assertEqual(float(state_by_id["itm_quote_one"]["score_breakdown"]["diversity_penalty"]), 0.0)
        self.assertGreater(float(state_by_id["itm_quote_two"]["score_breakdown"]["diversity_penalty"]), 0.0)
        self.assertLess(
            float(state_by_id["itm_quote_two"]["final_score"]),
            float(state_by_id["itm_story_distinct"]["final_score"]),
        )

    def test_story_clusters_group_semantic_reorders(self) -> None:
        rows = [
            make_row(
                item_id="itm_story_a",
                title="Rzad szykuje pakiet inwestycji energetycznych",
                channel_id="chn_a",
            ),
            make_row(
                item_id="itm_story_b",
                title="Pakiet inwestycji energetycznych szykuje rzad",
                channel_id="chn_b",
            ),
        ]

        clusters = build_story_clusters(rows)

        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0]["item_count"], 2)


if __name__ == "__main__":
    unittest.main()
