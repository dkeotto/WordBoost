import { GOLD_DATASET } from "../src/data/goldDataset.js";
import { validateGoldDataset, getGoldReviewQueue } from "../src/utils/goldDatasetPipeline.js";

const synReport = validateGoldDataset(GOLD_DATASET.synonyms, "synonyms");
const phrReport = validateGoldDataset(GOLD_DATASET.phrasal, "phrasal");

const print = (title, report) => {
  console.log(`\n=== ${title} ===`);
  console.log(`Toplam: ${report.total}`);
  console.log(`Approved: ${report.approved}`);
  console.log(`Review: ${report.review}`);
  console.log(`Rejected: ${report.rejected}`);
  console.log(`Invalid: ${report.invalid}`);
  console.log(`Seviye dağılımı:`, report.byLevel);
  if (report.invalidEntries.length > 0) {
    console.log("Hatalı girdiler:");
    report.invalidEntries.slice(0, 10).forEach((item) => {
      console.log(`- ${item.id}: ${item.errors.join(" | ")}`);
    });
  }
};

print("Synonyms Gold Dataset", synReport);
print("Phrasal Gold Dataset", phrReport);

const synReviewQueue = getGoldReviewQueue(GOLD_DATASET.synonyms).length;
const phrReviewQueue = getGoldReviewQueue(GOLD_DATASET.phrasal).length;
console.log(`\nReview Kuyruğu -> Synonyms: ${synReviewQueue}, Phrasal: ${phrReviewQueue}`);

