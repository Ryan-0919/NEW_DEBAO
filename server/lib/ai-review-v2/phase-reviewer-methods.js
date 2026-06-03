  /**
   * 合并answerMarks和highlight
   */
  mergeAnswerMarks(phase1Marks, highlights) {
    const highlightMap = {};
    highlights.forEach(h => {
      highlightMap[h.id] = h.highlight;
    });

    return phase1Marks.map(mark => ({
      ...mark,
      highlight: highlightMap[mark.id] || ''
    }));
  }

  /**
   * 根据answerMarks计算rubricPoints
   */
  calculateRubricPoints(answerMarks, rubric) {
    const rubricPoints = rubric.points.map(rp => ({
      id: rp.id,
      title: rp.title,
      score: rp.score,
      hit: false,
      awardedScore: 0
    }));

    // 遍历answerMarks，标记对应的rubricPoint
    answerMarks.forEach(mark => {
      if (mark.status === 'score' && mark.score > 0) {
        // 根据mark.id找到对应的rubricPoint
        // 假设mark.id格式为 "m1", "m2" 等，对应rubricPoints的索引
        const index = parseInt(mark.id.replace(/\D/g, '')) - 1;
        if (index >= 0 && index < rubricPoints.length) {
          rubricPoints[index].hit = true;
          rubricPoints[index].awardedScore = mark.score;
        }
      }
    });

    return rubricPoints;
  }
}
