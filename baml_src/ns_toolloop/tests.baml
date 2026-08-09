testset "toolloop" {
    test "T1 union return discriminates offline" {
        assert
            .equal(
                tool_name(WeatherAPI { city: "NYC", time_of_day: "2026-08-09T13:00:00Z" }),
                "weather",
            );
        assert.equal(tool_name(SearchAPI { query: "baml" }), "search")
    }

    test "T2 a class instance passes back INTO a baml function" {
        let call = WeatherAPI { city: "Boston", time_of_day: "2026-08-09T13:00:00Z" };
        assert.contains(execute_tool(call), "Boston")
    }

    test "T3 wrapper class parses a canned turn-1 output offline" {
        let inv = SelectTool$parse(TURN1_WEATHER());
        assert.equal(inv.tool, "weather");
        assert.not_null(inv.weather)
    }

    test "T4 bare union CANNOT be parsed offline" {
        let msg = (SelectToolBareUnion$parse(TURN1_WEATHER()).to_string()) catch_all (e) {
            _ => "THREW"
        };
        assert.equal(msg, "THREW")
    }

    test "T5 single-class parse is the working control" {
        let w = SelectWeatherOnly$parse(`{"city":"Boston","time_of_day":"2026-08-09T13:00:00Z"}`);
        assert.equal(w.city, "Boston")
    }

    test "T6 THE QUESTION: a tool result reaches the next turn's prompt" {
        let fed = loop_offline("what is the weather?", TURN1_WEATHER());
        assert.contains(fed, "temp_f");
        assert.contains(fed, "Boston");
        assert.contains(fed, "tool_result")
    }

    test "T7 the loop discriminates on the selected tool" {
        let fed = loop_offline("find me docs", TURN1_SEARCH());
        assert.contains(fed, "hits");
        assert.contains(fed, "baml tool calling")
    }

    test "T8 turn-2 prompt embeds the SAME renderer the tests assert" {
        let turns = [ToolTurn { tool_name: "weather", arguments_json: `{}`, result_json: `{"temp_f":58}` }];
        assert.contains(render_transcript(turns), `<tool_result name="weather"`)
    }
}
