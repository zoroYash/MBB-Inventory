import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing in .env');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to Database');

    const superAdminEmail = 'Mohanbartansridham@gmail.com'; 
    
    const existingAdmin = await User.findOne({ email: superAdminEmail });
    if (existingAdmin) {
      console.log('⚠️ Super Admin already exists. No action taken.');
      process.exit(0);
    }

    await User.create({
      name: 'Shop Owner',
      email: superAdminEmail,
      password: 'Password@123', 
      role: 'super_admin',
    });

    console.log('🎉 Super Admin seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding Super Admin:', error);
    process.exit(1);
  }
};

seedSuperAdmin();