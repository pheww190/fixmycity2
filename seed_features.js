// seed_features.js - Run once to populate sample hub articles, funding projects and polls
require('dotenv').config({ path: './backend/.env' });
const dbF = require('./backend/db_features');

async function seed() {
  console.log('🌱 Seeding feature data...');
  await new Promise(r => setTimeout(r, 1000)); // wait for DB init

  await dbF.addHubArticle({
    title: "Citizen's Guide to Municipal Services",
    category: "Rights & Duties",
    description: "Understand what services the municipality is obligated to provide and your corresponding responsibilities as a resident.",
    content: "Every citizen has the right to: (1) Clean drinking water within 100m of residence, (2) Waste collection at least thrice weekly, (3) Street lighting on public roads, (4) Grievance redressal within 30 days. You can escalate unresolved issues to the District Collector after this period."
  });

  await dbF.addHubArticle({
    title: "Proper Waste Segregation at Home",
    category: "Waste Management",
    description: "A step-by-step guide on how to segregate wet, dry, and hazardous waste before handover.",
    content: "Use GREEN bins for wet/organic waste (food scraps, vegetable peels). Use BLUE bins for dry recyclable waste (paper, plastic, glass, metal). Use RED bins for hazardous waste (batteries, e-waste, medicines). Segregated waste helps increase recycling rates by up to 80% and reduces landfill burden significantly."
  });

  await dbF.addHubArticle({
    title: "Applying for Rooftop Solar Subsidies",
    category: "Government Schemes",
    description: "Walkthrough on the government scheme providing financial support for residential solar panel installations.",
    content: "PM Surya Ghar Muft Bijli Yojana provides subsidies up to ₹78,000 for rooftop solar panels. Eligibility: Any household with a valid electricity meter. Apply at pmsuryaghar.gov.in or at your local municipality office. Required documents: Aadhar card, electricity bill, property ownership proof."
  });

  await dbF.addHubArticle({
    title: "Rainwater Harvesting – New Bylaws",
    category: "Water Conservation",
    description: "Explanation of the new city bylaws requiring rainwater harvesting structures in all new residential buildings.",
    content: "As per the amended building bylaws effective 2025, all new constructions above 300 sqm must install a rainwater harvesting system. Non-compliance will result in a penalty of ₹5,000 per month. Approved contractors can be found on the municipal portal. Subsidy of 30% is available for voluntary adoption in older buildings."
  });

  await dbF.addFundingProject({
    title: "Green Park Restoration",
    description: "Fund the installation of new benches, play equipment, and improved lighting in the central park.",
    goal: 100000
  });
  await dbF.contributeFunding(
    (await dbF.getFundingProjects())[0].id, 75000
  );

  await dbF.addFundingProject({
    title: "Solar Street Lights Initiative",
    description: "Replacing 50 conventional street lights in Sector 4 with energy-efficient solar alternatives.",
    goal: 500000
  });
  await dbF.contributeFunding(
    (await dbF.getFundingProjects())[1].id, 200000
  );

  await dbF.addFundingProject({
    title: "Community Library Upgrade",
    description: "Adding digital kiosks, 500 new books, and better seating arrangements to the public library.",
    goal: 50000
  });
  await dbF.contributeFunding(
    (await dbF.getFundingProjects())[2].id, 45000
  );

  await dbF.addPoll({
    title: "New Metro Station Location",
    description: "Which location is best suited for the proposed Sector 14 Metro Station?",
    options: [
      { text: "Near the Main Market", votes: 45 },
      { text: "Opposite the Central Park", votes: 30 },
      { text: "Adjacent to the Bus Terminal", votes: 25 }
    ]
  });

  await dbF.addPoll({
    title: "Weekend Pedestrian Zone",
    description: "Do you support making Commercial Street a pedestrian-only zone on weekends?",
    options: [
      { text: "Yes, strongly support", votes: 68 },
      { text: "No, keep it open for traffic", votes: 20 },
      { text: "Neutral / Need more info", votes: 12 }
    ]
  });

  console.log('✅ Feature data seeded successfully!');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
